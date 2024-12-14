import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import axios from 'axios';
import cookieParser from 'cookie-parser'; 
import cors from 'cors';
import helmet from 'helmet';

dotenv.config();

const app = express();

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security headers and middleware
app.use(helmet());


app.use(cors());


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const API_BASE_URL = process.env.API_URL;

// Utility: Check if user is authenticated using cookies
const checkAuth = (req, res, next) => {
  console.log("Checking authentication...");
  if (!req.cookies.userToken) {
    console.log("User is not authenticated. Redirecting to /auth");
    return res.redirect('/auth');
  }
  console.log("User is authenticated");
  next();
};

// Routes
app.get('/auth', (req, res) => {
  console.log("Rendering Auth page");
  res.render('Auth');
});



app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  console.log("Received signup request for:", username);

  try {
    const response = await fetch(`${API_BASE_URL}user/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    console.log("Response Status:", response.status);
    console.log("Response Content-Type:", response.headers.get('Content-Type'));

    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error("Failed to parse response as JSON:", err);
      return res.status(500).send("Server error: invalid response from API");
    }

    if (response.ok) {
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('userToken', data.access, { 
        httpOnly: true, 
        sameSite: 'None',  
        secure: isProduction 
      });
      console.log("Signup successful, user redirected to home.");
      res.redirect('/');
    } else {
      console.log("Signup failed with message:", data.message);
      res.status(response.status).send(data.message || "Signup failed");
    }

  } catch (err) {
    console.error("Error during signup:", err);
    res.status(500).send("Server error during signup");
  }
});



// LOGIN ROUTE
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log("Received login request for:", username);

  try {
    const response = await fetch(`${API_BASE_URL}token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error("Failed to parse response as JSON:", err);
      return res.status(500).send("Server error: invalid response from API");
    }

    if (response.ok) {
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('userToken', data.access, { 
        httpOnly: true, 
        sameSite: 'None', 
        secure: isProduction 
      });
      console.log("Login successful, user redirected to home.");
      res.redirect('/');
    } else {
      console.log("Login failed with message:", data.message);
      res.status(response.status).send(data.message || "Login failed");
    }
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).send("Server error during login");
  }
});

// LOGOUT ROUTE
app.post('/logout', async (req, res) => {
  console.log("Received logout request");

  try {
    const response = await fetch(`${API_BASE_URL}users/logout/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.cookies.userToken}`, 
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      console.log("Logout successful");
      res.clearCookie('userToken', { 
        httpOnly: true, 
        sameSite: 'None', 
        secure: process.env.NODE_ENV === 'production' 
      });
      res.redirect('/auth');
    } else {
      console.log("Logout failed with status", response.status);
      res.status(response.status).send("Logout failed");
    }
  } catch (err) {
    console.error("Error during logout:", err);
    res.status(500).send("Server error during logout");
  }
});


// Logout route
app.get('/logout', (req, res) => {
  // For session-based logout (if applicable):
  // req.session.destroy((err) => {
  //   if (err) {
  //     return res.status(500).send('Failed to log out');
  //   }
  //   res.redirect('/login'); // Redirect to the login page or home page
  // });

  // Clear the token in case it's stored in a cookie (optional, if relevant)
  res.clearCookie('userToken');
  res.redirect('/login'); // Redirect to login page or home page
});


// Render the home page if authenticated
app.get('/', checkAuth, (req, res) => {
  console.log("Rendering home page");
  res.render('Home', { userToken: req.cookies.userToken }); // Use token from cookies
});
app.get('/quiz', checkAuth, async (req, res) => {
  console.log("Fetching quiz questions...");
  res.clearCookie('quizQuestions');
  try {
    const response = await fetch(`${API_BASE_URL}quizzes/`, {
      headers: { 'Authorization': `Bearer ${req.cookies.userToken}` }
    });

    if (response.status === 200) {
      const questions = await response.json();
      console.log("Quiz questions fetched:", questions);
      res.cookie('quizQuestions', JSON.stringify(questions), { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // Store for 1 day
      res.render('Quiz', {
        questions: questions,
        userToken: req.cookies.userToken,
        userAnswers: []  // User's answers will be passed from cookies later
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


// in rendering endquiz i want also to display the question image.if they also.  to diplay image for option if available. base on this question structure.
//const questions = [{"id":3,"question":"what is the king of the jungle","question_image":null,
   // "answers":[{"id":21,"answer_text":"hen","is_correct":false,"answer_image":null},
   // {"id":22,"answer_text":"lion","is_correct":true,"answer_image":null},
   // {"id":23,"answer_text":"rat","is_correct":false,"answer_image":null},
  //  {"id":24,"answer_text":"cow","is_correct":false,"answer_image":null}]}]. also srtcuture of results 

  // [{"question_id":10,"selected_answer_id":49,"correct_answer_id":49,"is_correct":true},{"question_id":9,"selected_answer_id":46,"correct_answer_id":46,"is_correct":true}]


app.post('/quiz', async (req, res) => {
  console.log('--- Handling /quiz POST request ---');
  
  const { answers: rawAnswers } = req.body;
  let answers;
  
  // Parse and validate the answers
  try {
    answers = typeof rawAnswers === 'string' ? JSON.parse(rawAnswers) : rawAnswers;
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Answers cannot be empty or invalid' });
    }
  } catch (err) {
    console.error('Error parsing answers:', err.message);
    return res.status(400).json({ error: 'Invalid answers format' });
  }
  
  // Get quiz questions from cookies
  const questions = (() => {
    try {
      const parsed = JSON.parse(req.cookies.quizQuestions || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Error parsing quizQuestions cookie:', err.message);
      return [];
    }
  })();
  
  const userToken = req.cookies.userToken;
  if (!userToken) return res.status(401).json({ error: 'User not authenticated' });

  try {
    const response = await axios.post(
      `${API_BASE_URL}quizzes/`,
      { answers },
      {
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { results } = response.data;
    if (response.status === 201 && results) {
      const enhancedResults = results.map((result) => {
        const question = questions.find((q) => q.id === result.question_id);
        if (!question) return null;

        const selectedOption = question.answers.find((opt) => opt.id === result.selected_answer_id) || {};
        const correctOption = question.answers.find((opt) => opt.id === result.correct_answer_id) || {};

        return {
          question_text: question.question || `Question ID ${result.question_id}`,
          question_image: question.question_image || null,
          correct_answer: correctOption.answer_text || 'N/A',
          correct_answer_image: correctOption.answer_image || null,
          selected_answer: selectedOption.answer_text || 'N/A',
          selected_answer_image: selectedOption.answer_image || null,
          is_correct: result.is_correct,
          answers: question.answers.map((option) => ({
            answer_text: option.answer_text,
            answer_image: option.answer_image,
            is_correct: option.is_correct,
            selected: option.id === result.selected_answer_id,
          })),
        };
      }).filter(Boolean);

      const score = enhancedResults.filter((r) => r.is_correct).length;
      const passingScore = 12;
      const passed = score >= passingScore;

      return res.render('Endquiz', { score, results: enhancedResults, passed });
    } else {
      res.status(400).send('Error submitting quiz');
    }
  } catch (error) {
    console.error('Error during API request:', error.message);
    return res.status(500).json({ error: 'Error submitting quiz' });
  }
});



const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


