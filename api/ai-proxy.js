import fetch from 'node-fetch';

// This is the model you were using in your original file.
const OPENAI_MODEL = "gpt-4o-mini"; 
const API_BASE_URL = "https://api.openai.com/v1/chat/completions";

// --- IMPORTANT: This key is retrieved securely from Netlify's Environment Variables ---
// You will set the value of 'OPENAI_API_KEY' inside the Netlify UI.
const apiKey = process.env.OPENAI_API_KEY;

/**
 * Netlify Function Handler
 * This function serves as a secure proxy to the OpenAI API.
 * It handles token validation and securely injects the API Key.
 */
exports.handler = async (event) => {
    // 1. Check for valid HTTP method and API Key presence
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    if (!apiKey) {
        console.error("OPENAI_API_KEY environment variable is not set.");
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: API Key missing.' }) };
    }

    // 2. Access Control (Token Validation)
    const accessToken = event.headers['x-access-token'];
    // NOTE: For this demo, we use a simple hardcoded token check.
    // In a production app, you would check this token against a database/session.
    // The key is that the token MUST exist and be validated.
    if (!accessToken || !accessToken.startsWith('token-')) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Missing or invalid access token.' }) };
    }

    // 3. Parse and Validate Client Payload
    let clientPayload;
    try {
        clientPayload = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload.' }) };
    }
    
    const { department, symptoms, results, language } = clientPayload;

    if (!symptoms && !results) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Symptoms or test results must be provided.' }) };
    }

    // 4. Construct the System and User Prompts
    const systemInstruction = `You are a world-class AI diagnostic expert system focused on providing medical analysis and suggesting relevant In Vitro Diagnostic (IVD) tests.
        Your response MUST be a single JSON object.
        - Analyze the data provided (department, symptoms, results) and identify potential primary and secondary conditions.
        - Provide a comprehensive 'medical_analysis' (string) in the requested language.
        - Provide a list of top 3-5 'suggested_ivd_tests' (array of strings) that are most relevant to confirming the diagnosis.
        - Respond ONLY in the requested language: ${language}.
        - The JSON keys MUST be exactly 'medical_analysis' and 'suggested_ivd_tests'.
        - Do NOT include any introductory text, markdown formatting (like triple backticks or 'json'), or explanations outside of the JSON block.`;

    const userPrompt = `Analyze the following patient data for diagnosis and IVD recommendation:
        Department/Additional Info: ${department}
        Symptoms/Chief Complaint: ${symptoms}
        Clinical History/Test Results: ${results}`;

    // 5. Build the OpenAI Request Payload
    const openaiPayload = {
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
        ]
    };

    // 6. Call the OpenAI API securely
    try {
        const openaiResponse = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` // SECURE INJECTION
            },
            body: JSON.stringify(openaiPayload)
        });

        const openaiData = await openaiResponse.json();

        if (!openaiResponse.ok) {
            console.error("OpenAI API Error:", openaiData);
            return {
                statusCode: openaiResponse.status,
                body: JSON.stringify({ 
                    error: 'OpenAI API failed to process the request.', 
                    details: openaiData.error ? openaiData.error.message : 'Unknown error.'
                })
            };
        }

        const generatedJsonString = openaiData.choices?.[0]?.message?.content;
        
        if (!generatedJsonString) {
            return { statusCode: 500, body: JSON.stringify({ error: 'OpenAI response format unexpected.' }) };
        }
        
        // Return the valid JSON response directly to the client
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: generatedJsonString
        };

    } catch (error) {
        console.error("Fetch or processing error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Server failed to communicate with OpenAI: ${error.message}` })
        };
    }
};
