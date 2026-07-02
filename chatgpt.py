from openai import OpenAI

client = OpenAI()

print("ChatGPT terminal is ready. Type exit to quit.")

while True:
    q = input("You: ")

    if q.lower() in ["exit", "quit", "/bye"]:
        break

    response = client.responses.create(
        model="gpt-5.5",
        input=q
    )

    print("\nChatGPT:", response.output_text, "\n")
