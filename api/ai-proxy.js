// Vercel Serverless Function for OpenAI
const fetch = require('node-fetch');

// Read the OpenAI API Key securely from Vercel's environment variables
// IMPORTANT: The key MUST be set as OPENAI_API_KEY in Vercel project settings.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; 

// OpenAI Chat Completion Endpoint
const API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * The main handler function for the Vercel serverless endpoint (/api/ai-proxy).
 */
module.exports = async (req, res) => {
    // ----------------------------------------------------
    // 1. Setup & Pre-flight Checks (CORS, Key, Method)
    // ----------------------------------------------------
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle CORS preflight request (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Check configuration
    if (!OPENAI_API_KEY) {
        console.error("OPENAI_API_KEY environment variable is not set.");
        // Use 401 Unauthorized for client-side visibility on key issues
        res.status(401).json({ 
            error: "Server configuration error: OpenAI API Key is missing.",
            details: "Set OPENAI_API_KEY in Vercel environment variables." 
        });
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        // ----------------------------------------------------
        // 2. Process Frontend Request
        // ----------------------------------------------------
        
        // Vercel generally parses JSON bodies automatically
        const { model, messages, response_format } = req.body; 

        if (!model || !messages || !response_format) {
            res.status(400).json({ error: 'Bad Request: Missing required fields (model, messages, or response_format).' });
            return;
        }
        
        // ----------------------------------------------------
        // 3. Call OpenAI API
        // ----------------------------------------------------

        const payload = {
            model: model,
            messages: messages,
            response_format: response_format
        };

        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}` 
            },
            body: JSON.stringify(payload)
        });

        // Check OpenAI API's response status
        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            console.error("OpenAI API Error:", apiResponse.status, errorBody);
            // Return the actual error status and body to the client for debugging
            res.status(apiResponse.status).json({ 
                error: "OpenAI API request failed.", 
                details: errorBody 
            });
            return;
        }

        // ----------------------------------------------------
        // 4. Extract and Return Result
        // ----------------------------------------------------
        
        const data = await apiResponse.json();
        
        // Extraction logic for OpenAI response: choices[0].message.content
        const generatedJsonText = data.choices?.[0]?.message?.content;
        
        if (!generatedJsonText) {
             res.status(500).json({ error: "AI response format error: Generated content is empty or malformed." });
             return;
        }

        // Parse and return the final JSON result to the frontend
        const finalResult = JSON.parse(generatedJsonText);
        res.status(200).json(finalResult);

    } catch (error) {
        console.error("Vercel Function Execution Error:", error);
        // Return 500 error with internal function error message
        res.status(500).json({ 
            error: "Internal Server Error during execution.", 
            details: error.message 
        });
    }
};
