/**
 * Netlify Serverless Function to securely proxy requests to the OpenAI API.
 * * This function hides the OPENAI_API_KEY as an environment variable, preventing 
 * exposure in the client-side JavaScript.
 * * It listens on the internal path: /.netlify/functions/ai-proxy
 * Which is exposed publicly via the redirect: /api/ai-proxy
 */

// Use require for compatibility in Netlify's Node.js environment
const fetch = require('node-fetch');

// The main handler for the serverless function
exports.handler = async (event) => {
    // 1. Check for API Key
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: OpenAI API Key not found." }),
        };
    }

    // 2. Only accept POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // 3. Parse the request body from the client (index.html)
    let clientData;
    try {
        clientData = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON format in request body." }) };
    }

    // 4. Construct the Payload for OpenAI (using GPT-4o-mini for speed/cost)
    const openaiUrl = 'https://api.openai.com/v1/chat/completions';
    
    // The clientData should contain the system instruction and user prompt/data
    const openaiPayload = {
        model: "gpt-4o-mini", // Recommended fast model
        response_format: { type: "json_object" }, // Ensures structured output
        messages: clientData.messages,
        temperature: 0.1,
        max_tokens: 2000,
    };

    try {
        // 5. Securely call the OpenAI API
        const response = await fetch(openaiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // This is where the secured key is used:
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify(openaiPayload),
        });

        // 6. Handle HTTP errors from the OpenAI API itself (e.g., 401 invalid key, 429 rate limit)
        if (!response.ok) {
            const errorBody = await response.json();
            console.error("OpenAI API Error:", errorBody);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `OpenAI API Error: ${response.statusText}`, details: errorBody.error.message }),
            };
        }

        // 7. Return the successful response from OpenAI back to the client
        const data = await response.json();
        
        return {
            statusCode: 200,
            headers: {
                // IMPORTANT: Enable CORS for the client-side fetch call
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        };

    } catch (error) {
        console.error("Internal Proxy Fetch Error:", error);
        return {
            statusCode: 502, // Bad Gateway (error connecting to or reading from external API)
            body: JSON.stringify({ error: "AI analysis failed due to an internal server connection error." }),
        };
    }
};
