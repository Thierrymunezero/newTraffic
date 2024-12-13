import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const app = express();

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session Management
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'default_secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: 'strict',
    },
  })
);

// API Base URL
const API_BASE_URL = "https://quiz-74jy.onrender.com/api/";

// Middleware to check user authentication
const checkAuth = (req, res, next) => {
  if (!req.session.userToken) {
    console.log('Unauthorized access attempt, redirecting to /auth');
    return res.redirect('/auth');
  }
  next();
};

// Routes
// Authentication page
app.get('/auth', (req, res) => {
  res.render('Auth');
});

// User signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  try {
    console.log('Attempting signup with:', username);
    const response = await fetch(`${API_BASE_URL}users/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    console.log('Signup response:', response.status, data);

    if (response.ok) {
      req.session.userToken = data.token;
      console.log('Token stored in session:', data.token);
      res.redirect('/');
    } else {
      res.status(response.status).send(data.message || 'Signup failed');
    }
  } catch (err) {
    console.error('Error during signup:', err);
    res.status(500).send('Server error during signup');
  }
});

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    console.log('Attempting login with:', username);
    const response = await fetch(`${API_BASE_URL}users/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    console.log('Login response:', response.status, data);

    if (response.ok) {
      req.session.userToken = data.token;
      console.log('Token stored in session:', data.token);
      res.redirect('/');
    } else {
      res.status(response.status).send(data.message || 'Login failed');
    }
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).send('Server error during login');
  }
});

// User logout
app.post('/logout', checkAuth, async (req, res) => {
  try {
    console.log('Attempting logout for token:', req.session.userToken);
    const response = await fetch(`${API_BASE_URL}users/logout/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${req.session.userToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
          return res.status(500).send('Error logging out');
        }
        res.redirect('/auth');
      });
    } else {
      const data = await response.json();
      console.error('Logout failed:', data);
      res.status(response.status).send(data.message || 'Logout failed');
    }
  } catch (err) {
    console.error('Error during logout:', err);
    res.status(500).send('Server error during logout');
  }
});

// Home page
app.get('/', checkAuth, (req, res) => {
  console.log('Rendering home for token:', req.session.userToken);
  res.render('Home', { userToken: req.session.userToken });
});

// Fetch quiz questions
app.get('/quiz', checkAuth, async (req, res) => {
  try {
    console.log('Fetching quiz questions for token:', req.session.userToken);
    const response = await fetch(`${API_BASE_URL}quizzes/`, {
      method: 'GET',
      headers: { Authorization: `Token ${req.session.userToken}` },
    });

    const questions = await response.json();
    console.log('Quiz questions response:', response.status, questions);

    if (response.ok) {
      res.render('Quiz', { questions, userAnswers: [] });
    } else {
      res.status(response.status).send('No questions available');
    }
  } catch (err) {
    console.error('Error fetching quiz questions:', err);
    res.status(500).send('Error fetching quiz questions');
  }
});

// Submit quiz answers
app.post('/quiz', checkAuth, async (req, res) => {
  const userAnswers = req.body.answers || [];
  try {
    console.log('Submitting quiz answers:', userAnswers);
    const response = await fetch(`${API_BASE_URL}quizzes/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${req.session.userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answers: userAnswers }),
    });

    const data = await response.json();
    console.log('Quiz submission response:', response.status, data);

    if (response.ok) {
      const score = data.results.filter((r) => r.is_correct).length;
      const passed = score >= 12;
      res.render('endquiz', {
        score,
        passed,
        results: data.results,
        userAnswers,
      });
    } else {
      res.status(response.status).send('Error submitting quiz');
    }
  } catch (err) {
    console.error('Error during quiz submission:', err);
    res.status(500).send('Error during quiz submission');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
