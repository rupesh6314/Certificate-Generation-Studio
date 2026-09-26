import express from 'express';
import { createSopUser, getSopUserByEmail, updateSopAcceptance } from '../db.js';
import { sendAcceptanceEmail } from '../services/emailService.js';

const router = express.Router();

// POST /api/sop/admin/create-user
// Endpoint for admins to create a new user
router.post('/admin/create-user', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const userId = await createSopUser(email, password, name || '');
    
    res.status(201).json({ 
      success: true, 
      message: 'User created successfully', 
      user: {
        id: userId,
        name: name || '',
        email
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/sop/login
// Endpoint for users to login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await getSopUserByEmail(email);

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        isAccepted: user.is_accepted === 1
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/sop/accept
// Endpoint for users to accept SOP
router.post('/accept', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await getSopUserByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await updateSopAcceptance(user.id, true);

    // Send acceptance email
    try {
      await sendAcceptanceEmail(user.email, user.full_name || 'Team Member');
    } catch (mailErr) {
      console.warn('Acceptance recorded, but notification email could not be sent:', mailErr.message);
    }

    res.status(200).json({ 
      success: true, 
      message: 'SOP accepted successfully and email confirmation processed'
    });
  } catch (error) {
    console.error('Error accepting SOP:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
