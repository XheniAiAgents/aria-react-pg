@app.post("/chat/file")
async def chat_with_file(
    user_id: int = Form(...),
    mode: str = Form("work"),
    lang: str = Form("en"),
    message: str = Form(""),
    file: UploadFile = File(...),
):
    try:
        file_bytes = await file.read()
        mime_type = file.content_type or ""
        extracted = await extract_text_from_file(file_bytes, file.filename, mime_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if extracted["type"] == "image":
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        user_prompt = message if message.strip() else "Describe this image and extract any useful information."
        try:
            response = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": extracted["mime_type"],
                                "data": extracted["b64"]
                            }
                        },
                        {"type": "text", "text": user_prompt}
                    ]
                }]
            )
            aria_response = response.content[0].text
        except Exception as e:
            aria_response = f"I received your image ({extracted['name']}) but couldn't process it visually. Try describing what you need help with."
    else:
        file_context = (
            f"[ATTACHED FILE: {extracted['name']}]\n"
            f"{extracted['text']}\n"
            f"[END OF FILE]\n\n"
        )
        user_msg = file_context + (message if message.strip() else "Please analyze this document and give me a summary.")
        aria_response = await chat(user_id, user_msg, mode, lang)

    return {"response": aria_response, "filename": file.filename, "type": extracted["type"]}
