import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import axios from 'axios';
import cookieParser from 'cookie-parser'; 
import cors from 'cors';

const app = express();

// Load environment variables from .env file
dotenv.config();

// Setup the current file's path for Express views and static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS configuration
app.use(cors({
  origin: ['https://newtraffic-rules.onrender.com'], // Ensure this is the correct frontend URL
  credentials: true,
}));

// Axios default config for sending credentials with requests
axios.defaults.withCredentials = true;

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// API base URL from environment variable
const API_BASE_URL = process.env.API_URL;

// Middleware to check authentication from cookies
const checkAuth = (req, res, next) => {
  console.log("Checking authentication...");
  if (!req.cookies.userToken) {
    console.log("User is not authenticated. Redirecting to /auth");
    return res.redirect('/auth');
  }
  console.log("User is authenticated");
  next();
};

// Route for rendering the Auth page
app.get('/auth', (req, res) => {
  console.log("Rendering Auth page");
  res.render('Auth');
});

// Sign-up route
app.post('/signup', async (req, res) => {  
  const { username, password } = req.body;  
  console.log("Received signup request for:", username);  

  try {  
    const response = await fetch(`${API_BASE_URL}user/register/`, {  
      method: 'POST',  
      headers: { 'Content-Type': 'application/json' },  
      body: JSON.stringify({ username, password }),  
      credentials: 'include'  
    });  

    const data = await response.json();  

    if (response.ok) {  
      res.cookie('userToken', data.access, {   
        httpOnly: true,  
        secure: process.env.NODE_ENV === 'production',  
        sameSite: 'None' // Important for cross-site cookies in production
      });  
      console.log("Signup successful, user redirected to home.");  
      res.redirect('/');  
    } else {  
      console.log("Signup failed with message:", data.message);  
      res.status(400).send(data.message || "Signup failed");  
    }  
  } catch (err) {  
    console.error("Error during signup:", err);  
    res.status(500).send("Server error during signup");  
  }  
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log("Received login request for:", username);

  try {
    const response = await fetch(`${API_BASE_URL}token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'  
    });
    const data = await response.json();
    console.log("Login response:", data);

    if (response.ok) {
      res.cookie('userToken', data.access, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'None' });
      console.log("Login successful, user redirected to home.");
      res.redirect('/');
    } else {
      console.log("Login failed with message:", data.message);
      res.status(400).send(data.message || "Login failed");
    }
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).send("Server error during login");
  }
});

// Home page route
app.get('/', checkAuth, (req, res) => {
  console.log("Rendering home page");
  res.render('Home', { userToken: req.cookies.userToken });
});

// Quiz page route (GET request)
app.get('/quiz', checkAuth, async (req, res) => {  
  console.log("Fetching quiz questions...");  
  res.clearCookie('quizQuestions');  

  try {  
    const response = await fetch(`${API_BASE_URL}quizzes/`, {  
      method: 'GET',
      headers: {  
        'Authorization': `Bearer ${req.cookies.userToken}`, 
        'Content-Type': 'application/json', 
      },  
      credentials: 'include' // Ensures credentials are included
    });  

    if (response.status === 200) {  
      const questions = await response.json();  
      console.log("Quiz questions fetched:", questions);  
    
      res.cookie('quizQuestions', JSON.stringify(questions), {  
        httpOnly: true,  
        maxAge: 24 * 60 * 60 * 1000 // Cookie expiration of 24 hours
      });  
      res.render('Quiz', {  
        questions: questions,  
        userToken: req.cookies.userToken,  
        userAnswers: []  
      });  
    } else {  
      console.log("No questions available or Not found");  
      res.status(404).send("No questions available or Not found");  
    }  
  } catch (err) {  
    console.error("Error fetching quiz questions:", err);  
    res.status(500).send("Error fetching quiz questions");  
  }  
});

// Quiz results submission route (POST request)
app.post('/quiz', async (req, res) => {
  console.log('--- Handling /quiz POST request ---');

  const { answers: rawAnswers } = req.body;
  let answers;

  const question_first = JSON.parse(req.cookies.quizQuestions || '[]');
  const questions = Array.isArray(question_first) ? question_first : [];
  console.log(`${JSON.stringify(questions)}`);

  try {
    answers = typeof rawAnswers === 'string' ? JSON.parse(rawAnswers) : rawAnswers;
    console.log(`Parsed answers: ${JSON.stringify(answers)}`);
  } catch (err) {
    console.error('Error parsing answers:', err.message);
    return res.status(400).json({ error: 'Invalid answers format' });
  }

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'Answers cannot be empty or invalid' });
  }

  const userToken = req.cookies.userToken;
  if (!userToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    const response = await axios.post(  
      `${API_BASE_URL}quizzes/`,  
      { answers },  
      {  
        headers: {  
          Authorization: `Bearer ${userToken}`,  
          'Content-Type': 'application/json',  
        },  
        withCredentials: true 
      }  
    ); 
    const { results } = response.data;
    console.log(`API results: ${JSON.stringify(results)}`);

    if (response.status === 201 && results) {
      const enhancedResults = results.map((result) => {
        const question = questions.find((q) => q.id === result.question_id);

        if (!question) return null;

        const selectedOption = question.answers.find((opt) => opt.id === result.selected_answer_id);
        const correctOption = question.answers.find((opt) => opt.id === result.correct_answer_id);

        return {
          question_text: question.question || `Question ID ${result.question_id}`,
          question_image: question.question_image || null,
          correct_answer: correctOption ? correctOption.answer_text : 'N/A',
          correct_answer_image: correctOption ? correctOption.answer_image : null,
          selected_answer: selectedOption ? selectedOption.answer_text : 'N/A',
          selected_answer_image: selectedOption ? selectedOption.answer_image : null,
          is_correct: result.is_correct,
          answers: question.answers.map((option) => ({
            answer_text: option.answer_text,
            answer_image: option.answer_image,
            is_correct: option.is_correct,
            selected: option.id === result.selected_answer_id,
          })),
        };
      }).filter((result) => result !== null);

      const score = enhancedResults.filter((r) => r.is_correct).length;
      const passingScore = 12;
      const passed = score >= passingScore;

      return res.render('Endquiz', {
        score,
        results: enhancedResults,
        passed,
      });
    } else {
      res.status(400).send('Error submitting quiz');
    }
  } catch (error) {
    console.error('Error during API request:', error.message);
    return res.status(500).json({ error: 'Error submitting quiz' });
  }
});

// Server startup
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
