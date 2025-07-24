const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors({
  origin: true,
  credentials: true
}));

// Add basic middleware
app.use(express.json());

// In-memory storage for verification codes (use Redis in production)
const verificationStore = new Map();

// Root route
app.get("/", (req, res) => {
  res.send("BubbleDuel API is now live on Render!");
});

app.get("/status", (req, res) => {
  res.json({ 
    message: "API is working on Render!",
    timestamp: new Date().toISOString(),
    status: "active"
  });
});

// Generate verification code endpoint
app.post('/roblox/generate-code', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username is required' 
      });
    }

    // Word list for generating random verification phrases
    const words = [
      'apple', 'banana', 'cherry', 'dragon', 'eagle', 'forest', 'galaxy', 'harbor',
      'island', 'jungle', 'knight', 'legend', 'magic', 'ninja', 'ocean', 'planet',
      'quest', 'river', 'storm', 'tiger', 'unity', 'valley', 'warrior', 'xenon',
      'yellow', 'zebra', 'arrow', 'bridge', 'castle', 'diamond', 'energy', 'flame',
      'golden', 'hunter', 'iron', 'jewel', 'kingdom', 'light', 'moon', 'nature',
      'orange', 'power', 'quick', 'royal', 'silver', 'thunder', 'ultra', 'victory',
      'wizard', 'brave', 'cloud', 'dream', 'echo', 'frost', 'ghost', 'heart',
      'ice', 'joy', 'key', 'love', 'mind', 'night', 'open', 'peace'
    ];

    // Generate a random 5-word verification code with BubbleDuel prefix
    const randomWords = [];
    for (let i = 0; i < 4; i++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      randomWords.push(words[randomIndex]);
    }
    
    const verificationCode = `BubbleDuel ${randomWords.join(' ')}`;
    
    // Store the verification code with timestamp and username
    verificationStore.set(verificationCode, {
      username: username,
      timestamp: Date.now(),
      manualVerified: false
    });
    
    console.log(`Generated verification code for ${username}: ${verificationCode}`);
    
    res.json({
      success: true,
      verificationCode: verificationCode
    });
    
  } catch (error) {
    console.error('Error generating verification code:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Real verification endpoint - actually checks Roblox bio
app.post('/roblox/verify-real', async (req, res) => {
  try {
    const { username, verificationCode } = req.body;
    
    if (!username || !verificationCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and verification code are required' 
      });
    }

    // Check if this is a valid generated code
    const storedData = verificationStore.get(verificationCode);
    if (!storedData) {
      return res.json({
        success: true,
        verified: false,
        error: 'Verification code not found or expired. Please generate a new code.'
      });
    }

    // Check if the username matches
    if (storedData.username.toLowerCase() !== username.toLowerCase()) {
      return res.json({
        success: true,
        verified: false,
        error: 'Verification code does not match the username.'
      });
    }

    // Check if code has expired (5 minutes)
    const now = Date.now();
    if (now - storedData.timestamp > 5 * 60 * 1000) {
      verificationStore.delete(verificationCode);
      return res.json({
        success: true,
        verified: false,
        error: 'Verification code has expired. Please generate a new one.'
      });
    }

    try {
      // Search for the user with Render's better connectivity
      const userSearchResponse = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 300;
        }
      });
      
      console.log('User search response:', userSearchResponse.status, userSearchResponse.data);
      
      if (!userSearchResponse.data || !userSearchResponse.data.data || userSearchResponse.data.data.length === 0) {
        return res.json({
          success: true,
          verified: false,
          error: 'Roblox user not found. Please check your username and try again.'
        });
      }

      const userId = userSearchResponse.data.data[0].id;
      const actualUsername = userSearchResponse.data.data[0].name;

      // Get profile description
      const profileResponse = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 300;
        }
      });
      
      console.log('Profile response:', profileResponse.status, profileResponse.data);
      
      const description = profileResponse.data.description || '';
      console.log(`Checking bio for user ${actualUsername} (ID: ${userId}): "${description}"`);
      console.log(`Looking for verification code: "${verificationCode}"`);

      // Check if verification code is in the description
      if (description.includes(verificationCode)) {
        // Success! Clean up the verification code
        verificationStore.delete(verificationCode);
        
        let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;
        
        return res.json({
          success: true,
          verified: true,
          user: {
            id: userId,
            username: actualUsername,
            displayName: profileResponse.data.displayName || actualUsername,
            description: description,
            avatarUrl: avatarUrl,
            verifiedAt: new Date().toISOString()
          }
        });
      } else {
        return res.json({
          success: true,
          verified: false,
          error: `Verification code not found in your profile description. Your current bio: "${description.length > 0 ? description : '[empty]'}". Please add the code: ${verificationCode}`
        });
      }
      
    } catch (robloxError) {
      console.error('Roblox API Error Details:', {
        message: robloxError.message,
        status: robloxError.response?.status,
        statusText: robloxError.response?.statusText,
        data: robloxError.response?.data
      });
      
      // On Render, we can try a fallback approach since connectivity should be better
      // For now, still provide a meaningful error but don't auto-succeed
      return res.json({
        success: true,
        verified: false,
        error: 'Unable to verify your Roblox profile at the moment. Please ensure you have added the verification code to your bio and try again in a few seconds.'
      });
    }
    
  } catch (error) {
    console.error('Error in real verify:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Manual confirmation endpoint for fallback
app.post('/roblox/confirm-manual', async (req, res) => {
  try {
    const { verificationCode } = req.body;
    
    if (!verificationCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Verification code is required' 
      });
    }

    const storedData = verificationStore.get(verificationCode);
    if (!storedData) {
      return res.json({
        success: false,
        error: 'Verification code not found or expired.'
      });
    }

    // Mark as manually verified
    storedData.manualVerified = true;
    verificationStore.set(verificationCode, storedData);

    res.json({
      success: true,
      message: 'Confirmation received. Please try verification again.'
    });
    
  } catch (error) {
    console.error('Error in manual confirm:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`BubbleDuel API running on port ${PORT}`);
  console.log(`Server started at ${new Date().toISOString()}`);
});
