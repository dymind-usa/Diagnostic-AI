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
        // 2. Process Frontend Request (Receives raw patient data)
        // ----------------------------------------------------
        
        // Frontend sends: department, symptoms, results, language
        const { department, symptoms, results, language } = req.body; 

        if (!symptoms && !results) {
            res.status(400).json({ error: 'Bad Request: Symptoms or test results are required.' });
            return;
        }

        // --- System Prompt Setup (Instructs the AI and defines the JSON output) ---
        // This schema ensures the AI returns structured data for the frontend to easily display.
        const outputSchema = {
            type: "object",
            properties: {
                medical_analysis: {
                    type: "string",
                    description: `Detailed medical analysis and preliminary differential diagnosis based on the provided data, written in ${language}.`
                },
                suggested_ivd_tests: {
                    type: "array",
                    description: `A list of 3-5 necessary In Vitro Diagnostic (IVD) tests to confirm the diagnosis, written in ${language}.`
                }
            },
            required: ["medical_analysis", "suggested_ivd_tests"]
        };
        
        const systemPrompt = `You are an expert AI diagnostic assistant specializing in laboratory and IVD analysis. 
        Your task is to analyze patient data and provide a medical analysis and suggested IVD tests.
        You MUST respond only with a single JSON object that conforms strictly to the provided JSON schema.
        The response MUST be written in the language specified: ${language}.
        
        Input Data Summary:
        - Department/Additional Info: ${department}
        - Symptoms/Complaints: ${symptoms}
        - Clinical History/Test Results: ${results}`;

        // --- Final OpenAI Payload Construction ---
        const modelToUse = "gpt-4-turbo-preview"; // Using a modern model capable of JSON mode
        
        const payload = {
            model: modelToUse,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Please perform the medical analysis and generate the IVD test recommendations now based on the summarized input data." }
            ],
            // Request JSON mode for guaranteed structured output
            response_format: { type: "json_object" }
        };
        
        // ----------------------------------------------------
        // 3. Call OpenAI API
        // ----------------------------------------------------

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
