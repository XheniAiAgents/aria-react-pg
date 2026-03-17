# ══ ADD THESE IMPORTS to the top of main.py ══
# from fastapi import File, UploadFile, Form
# from file_handler import extract_text_from_file

# ══ ADD THIS ENDPOINT to main.py ══

@app.post("/chat/file")
async def chat_with_file(
    user_id: int = Form(...),
    mode: str = Form("work"),
    lang: str = Form("en"),
    message: str = Form(""),
    file: UploadFile = File(...),
):
    """Chat with an attached file (PDF, DOCX, image, txt, etc.)"""
    try:
        file_bytes = await file.read()
        mime_type = file.content_type or ""
        extracted = await extract_text_from_file(file_bytes, file.filename, mime_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if extracted["type"] == "image":
        # Use Groq vision model for images
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        user_prompt = message if message.strip() else "Describe this image and extract any useful information."
        try:
            response = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{extracted['mime_type']};base64,{extracted['b64']}"
                                }
                            },
                            {"type": "text", "text": user_prompt}
                        ]
                    }
                ]
            )
            aria_response = response.choices[0].message.content
        except Exception as e:
            # Fallback if vision model unavailable
            aria_response = f"I received your image ({extracted['name']}) but couldn't process it visually. Try describing what you need help with."

    else:
        # Document — inject text into chat context
        file_context = (
            f"[ATTACHED FILE: {extracted['name']}]\n"
            f"{extracted['text']}\n"
            f"[END OF FILE]\n\n"
        )
        user_msg = file_context + (message if message.strip() else "Please analyze this document and give me a summary.")
        aria_response = await chat(user_id, user_msg, mode, lang)

    return {"response": aria_response, "filename": file.filename, "type": extracted["type"]}
