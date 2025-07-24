const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

const wordList = [
    "apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew",
    "kiwi", "lemon", "mango", "nectarine", "orange", "pear", "quince", "raspberry",
    "strawberry", "tangerine", "watermelon", "apricot", "blueberry", "coconut",
    "dragonfruit", "guava", "lime", "peach", "plum", "pineapple", "pomegranate",
    "robot", "computer", "code", "matrix", "cyber", "digital", "sphere", "pixel",
    "logic", "quantum", "network", "server", "algorithm", "data", "binary", "virtual",
    "space", "galaxy", "star", "planet", "comet", "nebula", "cosmos", "asteroid",
    "moon", "sun", "earth", "jupiter", "mars", "saturn", "uranus", "neptune",
    "ocean", "river", "mountain", "forest", "desert", "volcano", "island", "valley",
    "city", "town", "village", "bridge", "tower", "castle", "pyramid", "temple",
    "eagle", "lion", "tiger", "bear", "wolf", "fox", "deer", "owl", "hawk", "falcon",
    "spirit", "dream", "light", "shadow", "echo", "whisper", "silence", "harmony",
    "journey", "quest", "adventure", "mystery", "secret", "legend", "myth", "magic"
];

function generateRandomPhrase(numWords = 4) {
    let phrase = [];
    for (let i = 0; i < numWords; i++) {
        const randomIndex = Math.floor(Math.random() * wordList.length);
        phrase.push(wordList[randomIndex]);
    }
    return phrase.join(' ');
}

exports.generateVerificationPhrase = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username is required.' });
        }

        const verificationPhrase = `BubbleDuel | ${username} | ${generateRandomPhrase()}`;
        const userVerificationRef = db.collection('verifications').doc(username);

        try {
            await userVerificationRef.set({
                phrase: verificationPhrase,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                verified: false
            });
            return res.status(200).json({ phrase: verificationPhrase });
        } catch (error) {
            console.error("Error storing verification phrase:", error);
            return res.status(500).json({ error: 'Could not generate verification phrase.' });
        }
    });
});

exports.verifyRobloxBio = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username is required.' });
        }

        const userVerificationRef = db.collection('verifications').doc(username);

        try {
            const doc = await userVerificationRef.get();
            if (!doc.exists) {
                return res.status(404).json({ success: false, error: 'No verification process started for this user.' });
            }

            const { phrase } = doc.data();

            // 1. Get Roblox User ID from username
            const searchResponse = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${username}&limit=10`);
            const users = searchResponse.data.data;
            const robloxUser = users.find(u => u.name.toLowerCase() === username.toLowerCase());

            if (!robloxUser) {
                return res.status(404).json({ success: false, error: 'Roblox user not found.' });
            }
            const userId = robloxUser.id;

            // 2. Get user's description (bio)
            const userResponse = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
            const bio = userResponse.data.description;

            // 3. Check if the bio contains the phrase
            if (bio && bio.includes(phrase)) {
                // Mark as verified in Firestore
                await userVerificationRef.update({ verified: true, verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
                
                // Optional: You could also create a document in a separate 'verifiedUsers' collection
                await db.collection('verifiedUsers').doc(userId.toString()).set({
                    username: username,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                return res.status(200).json({ success: true, message: 'Verification successful!' });
            } else {
                return res.status(400).json({ success: false, error: 'Verification phrase not found in Roblox bio.' });
            }

        } catch (error) {
            console.error("Error during verification:", error);
            if (error.response) {
                console.error("Roblox API Error:", error.response.data);
            }
            return res.status(500).json({ success: false, error: 'An error occurred during verification.' });
        }
    });
});
