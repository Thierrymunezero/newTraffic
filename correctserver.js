import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import axios from 'axios';
import cookieParser from 'cookie-parser'; // Import cookie-parser

dotenv.config();

const app = express();

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Middleware for parsing JSON
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // Use cookie-parser middleware






const API_BASE_URL = "http://10.200.17.34:8000/api/";

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

    const data = await response.json();
    console.log("Signup response:", data);

    if (response.ok) {
      res.cookie('userToken', data.access, { httpOnly: true }); // Set token in cookies
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

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log("Received login request for:", username);

  try {
    const response = await fetch(`${API_BASE_URL}token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    console.log("Login response:", data);

    if (response.ok) {
      res.cookie('userToken', data.access, { httpOnly: true }); // Set token in cookies
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

app.post('/logout', async (req, res) => {
  console.log("Received logout request");
  try {
    const response = await fetch(`${API_BASE_URL}users/logout/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.cookies.userToken}`, // Get token from cookies
        'Content-Type': 'application/json'
      }
    });
    if (response.status === 200) {
      console.log("Logout successful");
      res.clearCookie('userToken'); // Clear the token cookie
      res.redirect('/auth');
    } else {
      console.log("Logout failed");
      res.status(400).send("Logout failed");
    }
  } catch (err) {
    console.error("Error during logout:", err);
    res.status(500).send("Server error during logout");
  }
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

app.post('/quiz', async (req, res) => {
  console.log('--- Handling /quiz POST request ---');

  let { answers } = req.body;

  // Get the questions from cookies
  const question_first = JSON.parse(req.cookies.quizQuestions || '[]');
  const questions = Array.isArray(question_first) ? question_first : [];

  // Parse answers if provided as a string
  if (typeof answers === 'string') {
    try {
      answers = JSON.parse(answers);
    } catch (err) {
      console.error('Error parsing answers string:', err.message);
      return res.status(400).json({ error: 'Invalid answers format' });
    }
  }

  // Validate answers
  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'Answers cannot be empty or invalid' });
  }

  // Validate userToken from cookies
  const userToken = req.cookies.userToken;
  if (!userToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    // Make a POST request to submit answers
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
      // Process results and calculate score
      const enhancedResults = results.map((result) => {
        const question = questions.find((q) => q.id === result.question_id);
        const selectedOption = question.answers.find((opt) => opt.id === result.selected_answer_id);
        const correctOption = question.answers.find((opt) => opt.is_correct === true);

        return {
          question: question.question || `Question ID ${result.question_id}`,
          correct_answer: correctOption ? correctOption.answer_text : 'N/A',
          selected_answer: selectedOption ? selectedOption.answer_text : 'N/A',
          is_correct: result.is_correct,
          answers: question.answers.map(option => ({
            answer_text: option.answer_text,
            is_correct: option.is_correct,
            selected: option.id === result.selected_answer_id
          }))
        };
      }).filter((result) => result !== null);

      // Calculate score (increase score for correct answers)
      const score = enhancedResults.filter((r) => r.is_correct).length;
      const passingScore = 12; // Adjust as needed
      const passed = score >= passingScore;

      // Render the Endquiz page with the results and score
      res.render('Endquiz', {
        score,
        results: enhancedResults,
        passed
      });
    } else {
      res.status(400).send('Error submitting quiz');
    }
  } catch (error) {
    console.error('Error during API request:', error.message);
    res.status(500).json({ error: 'Error submitting quiz' });
  }
});



const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
