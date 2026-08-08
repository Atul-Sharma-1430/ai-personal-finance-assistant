import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import logging

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

logging.basicConfig(level=logging.INFO)

SYSTEM_INSTRUCTION = """You are an AI Personal Finance Assistant. You ONLY answer questions related to finance and financial education. You can answer questions across personal finance, investing, trading concepts, banking, financial markets, economics related to finance, and other legitimate financial topics. Understand natural language and do not require predefined questions. 

If a user asks a question that is clearly unrelated to finance (e.g. general programming, jokes, sports, entertainment, history, recipes, general weather, non-financial trivia), you MUST politely refuse and state ONLY:
"I'm a Personal Finance Assistant. I can only answer finance-related questions."

Provide clear, educational, and general financial guidance. Do not guarantee profits, returns, or financial outcomes."""

def call_gemini(user_message, history=None):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key.strip() == "" or api_key.strip() == "your_api_key_here":
        raise ValueError("GEMINI_API_KEY is not configured in .env file. Please add your actual Gemini API key to .env.")

    # Try using official google-genai SDK
    try:
        from google import genai
        from google.genai import types
        from google.genai.errors import APIError

        client = genai.Client(api_key=api_key)
        
        # Build contents array incorporating history if available
        contents = []
        if history and isinstance(history, list):
            for item in history:
                content_text = item.get("content", "").strip()
                # Skip error messages from history
                if not content_text or content_text.startswith("⚠️") or "Failed to get AI response" in content_text:
                    continue
                
                role = "user" if item.get("role") == "user" else "model"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=content_text)]
                ))
        
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)]
        ))

        # Verified active candidate models for Gemini API on this key
        candidate_models = [
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite"
        ]

        last_error = None
        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        temperature=0.7,
                    )
                )
                if response and response.text:
                    return response.text
            except APIError as api_err:
                err_str = str(api_err)
                if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
                    app.logger.warning(f"Rate limit hit on {model_name}: {err_str[:120]}")
                    raise ValueError("Gemini API rate limit reached (429). Please wait a few seconds before asking your next question.")
                else:
                    app.logger.warning(f"Model {model_name} failed: {err_str[:120]}")
                    last_error = api_err
            except Exception as e:
                app.logger.warning(f"Model {model_name} failed: {e}")
                last_error = e

        if last_error:
            raise last_error

    except ImportError:
        # Fallback to google-generativeai package if google-genai isn't available
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=SYSTEM_INSTRUCTION
        )
        
        formatted_history = []
        if history and isinstance(history, list):
            for item in history:
                content_text = item.get("content", "").strip()
                if not content_text or content_text.startswith("⚠️"):
                    continue
                role = "user" if item.get("role") == "user" else "model"
                formatted_history.append({
                    "role": role,
                    "parts": [content_text]
                })
        
        chat = model.start_chat(history=formatted_history)
        response = chat.send_message(user_message)
        return response.text

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Message is required."}), 400

        user_message = data["message"].strip()
        if not user_message:
            return jsonify({"error": "Message cannot be empty."}), 400

        history = data.get("history", [])

        response_text = call_gemini(user_message, history)
        return jsonify({"response": response_text})

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        err_msg = str(e)
        if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
            return jsonify({"error": "Gemini API rate limit reached (429). Please wait a few seconds and try again."}), 429
        app.logger.error(f"Error handling chat request: {e}", exc_info=True)
        return jsonify({"error": f"Failed to get AI response: {err_msg}"}), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"\n=======================================================")
    print(f"AI Personal Finance Assistant running on http://127.0.0.1:{port}")
    print(f"=======================================================\n")
    app.run(host="0.0.0.0", port=port, debug=True)
