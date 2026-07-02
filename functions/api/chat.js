export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const userMessage = body.message || "";
    const history = body.history || [];

    if (!userMessage.trim()) {
      return jsonResponse({
        answer: "How may I help you plan your Chef Maria experience?"
      });
    }

    const openaiApiKey = env.OPENAI_API_KEY;
    const resendApiKey = env.RESEND_API_KEY;
    const chefEmail = env.CHEF_MARIA_EMAIL || "cucinadiverona@gmail.com";

    if (!openaiApiKey) {
      return jsonResponse({
        answer:
          "Sorry, Chef Maria AI is having trouble connecting right now. Please call 561-692-1473 or email cucinadiverona@gmail.com."
      });
    }

    const bookingInfo = extractBookingInfo(userMessage, history);

    const isConfirmation =
      /^(yes|yes please|correct|confirmed|confirm|looks good|that is correct|everything is correct|ok|okay|send it|submit)$/i.test(
        userMessage.trim()
      );

    if (isConfirmation && bookingInfo.readyToSend) {
      let emailSent = false;

      if (resendApiKey) {
        emailSent = await sendBookingEmail({
          resendApiKey,
          chefEmail,
          bookingInfo
        });
      }

      if (emailSent) {
        return jsonResponse({
          answer:
            "Thank you! Your request has been sent to Chef Maria.\n\nChef Maria will confirm availability and final pricing shortly.\n\nPhone: 561-692-1473\nEmail: cucinadiverona@gmail.com"
        });
      }

      return jsonResponse({
        answer:
          "Your request is ready, but the email service is not connected yet. Please contact Chef Maria directly:\n\nPhone: 561-692-1473\nEmail: cucinadiverona@gmail.com"
      });
    }

    const messages = [
      {
        role: "system",
        content: `You are Chef Maria AI, the assistant for Chef Maria's private chef and catering service in South Florida.

Your job:
Help customers with private chef service, catering, menu ideas, pricing questions, availability questions, and booking requests.

Booking detail order:
1. guest count
2. service type
3. city/location
4. date
5. time
6. menu preference
7. allergies or dietary restrictions
8. name
9. email
10. phone

Chef Maria service area:
Miami, Fort Lauderdale, Boca Raton, Palm Beach, Broward County, and South Florida.

Tone:
Warm, elegant, helpful, concise.

Booking rules:
- Ask for one missing booking detail at a time.
- Do not sound robotic.
- If the customer gives several details at once, acknowledge them and ask only for what is still missing.
- For groups over 10 guests, explain that Chef Maria may recommend catering or additional service staff.
- Always say Chef Maria will confirm availability and final pricing.
- When all booking details are collected, summarize the details and ask the customer to confirm.
- Do not say the booking is final until the customer confirms.
- For final booking confirmations, always tell customers:

Phone: 561-692-1473
Email: cucinadiverona@gmail.com`
      },
      ...history,
      {
        role: "user",
        content: userMessage
      }
    ];

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.log("OpenAI error:", errorText);

      return jsonResponse({
        answer:
          "Sorry, Chef Maria AI is having trouble connecting right now. Please call 561-692-1473 or email cucinadiverona@gmail.com."
      });
    }

    const aiData = await aiResponse.json();

    return jsonResponse({
      answer:
        aiData.choices?.[0]?.message?.content ||
        "How may I help you plan your Chef Maria experience?"
    });
  } catch (error) {
    console.log("Chat error:", error);

    return jsonResponse({
      answer:
        "Sorry, Chef Maria AI is having trouble connecting right now. Please call 561-692-1473 or email cucinadiverona@gmail.com."
    });
  }
}

export async function onRequestGet() {
  return jsonResponse({
    ok: true,
    message: "Chef Maria AI chat endpoint is working."
  });
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function extractBookingInfo(userMessage, history) {
  const allText = [
    ...history.map((item) => item.content || ""),
    userMessage
  ].join("\n");

  const guestsMatch = allText.match(/(\d+)\s*(people|guests|persons|adults|kids|children)?/i);
  const emailMatch = allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = allText.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

  const cityMatch = allText.match(
    /(Miami|Fort Lauderdale|Boca Raton|Palm Beach|West Palm Beach|Broward|Deerfield Beach|Pompano Beach|Delray Beach|Hollywood|Aventura|Sunny Isles|Jupiter)/i
  );

  const serviceMatch = allText.match(
    /(private chef|catering|drop[-\s]?off|dinner|lunch|brunch|breakfast|party|event)/i
  );

  const timeMatch = allText.match(
    /\b(1[0-2]|0?[1-9])(:[0-5][0-9])?\s*(am|pm|AM|PM)\b/
  );

  const dateMatch = allText.match(
    /(today|tomorrow|this saturday|this sunday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan\.?|feb\.?|mar\.?|apr\.?|may|jun\.?|jul\.?|aug\.?|sep\.?|oct\.?|nov\.?|dec\.?|january|february|march|april|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}\/?\d{0,4})/i
  );

  const allergiesMatch = allText.match(
    /(no allergies|no allergy|gluten[-\s]?free|celiac|dairy[-\s]?free|nut allergy|nuts allergy|vegetarian|vegan|kosher|halal|allergic to [^.]+)/i
  );

  const nameMatch =
    allText.match(/my name is\s+([A-Za-z\s]+)/i) ||
    allText.match(/name:\s*([A-Za-z\s]+)/i) ||
    allText.match(/I am\s+([A-Za-z\s]+)/i);

  const menuPreference = findMenuPreference(allText);

  const info = {
    guests: guestsMatch ? guestsMatch[1] : "",
    serviceType: serviceMatch ? serviceMatch[0] : "",
    cityLocation: cityMatch ? cityMatch[0] : "",
    date: dateMatch ? dateMatch[0] : "",
    time: timeMatch ? timeMatch[0] : "",
    menuPreference,
    allergies: allergiesMatch ? allergiesMatch[0] : "",
    name: nameMatch ? nameMatch[1].trim() : "",
    email: emailMatch ? emailMatch[0] : "",
    phone: phoneMatch ? phoneMatch[0] : ""
  };

  const readyToSend =
    info.guests &&
    info.serviceType &&
    info.cityLocation &&
    info.date &&
    info.time &&
    info.menuPreference &&
    info.allergies &&
    info.name &&
    info.email &&
    info.phone;

  return {
    ...info,
    readyToSend
  };
}

function findMenuPreference(text) {
  const menuWords = [
    "bruschetta",
    "caprese",
    "seafood salad",
    "gnocchi",
    "squash gnocchi",
    "pasta",
    "lasagna",
    "risotto",
    "chicken piccata",
    "chicken marsala",
    "branzino",
    "salmon",
    "tiramisu",
    "tiramisù",
    "cannoli",
    "italian",
    "menu"
  ];

  const found = menuWords.filter((word) =>
    text.toLowerCase().includes(word.toLowerCase())
  );

  if (found.length > 0) {
    return found.join(", ");
  }

  return "";
}

async function sendBookingEmail({ resendApiKey, chefEmail, bookingInfo }) {
  const html = `
    <h2>New Chef Maria Booking Request</h2>

    <p><strong>Guest count:</strong> ${bookingInfo.guests || "Not provided"}</p>
    <p><strong>Service type:</strong> ${bookingInfo.serviceType || "Not provided"}</p>
    <p><strong>City / Location:</strong> ${bookingInfo.cityLocation || "Not provided"}</p>
    <p><strong>Date:</strong> ${bookingInfo.date || "Not provided"}</p>
    <p><strong>Time:</strong> ${bookingInfo.time || "Not provided"}</p>
    <p><strong>Menu preference:</strong> ${bookingInfo.menuPreference || "Not provided"}</p>
    <p><strong>Allergies / Dietary restrictions:</strong> ${bookingInfo.allergies || "Not provided"}</p>
    <p><strong>Name:</strong> ${bookingInfo.name || "Not provided"}</p>
    <p><strong>Email:</strong> ${bookingInfo.email || "Not provided"}</p>
    <p><strong>Phone:</strong> ${bookingInfo.phone || "Not provided"}</p>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Chef Maria Website <bookings@mariaprivatechef.com>",
      to: chefEmail,
      subject: `New Chef Maria Booking Request - ${bookingInfo.cityLocation || "South Florida"}`,
      html
    })
  });

  if (!resendResponse.ok) {
    const text = await resendResponse.text();
    console.log("Resend error:", text);
  }

  return resendResponse.ok;
}
