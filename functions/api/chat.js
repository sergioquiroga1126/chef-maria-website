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

    /*
     * ENFORCE FOOD SELECTION
     *
     * A cuisine name alone is not a complete menu.
     * Do this on the server so the AI cannot accidentally skip
     * directly to allergies.
     */
    const lastAssistantMessage =
      [...history]
        .reverse()
        .find((item) => item.role === "assistant")
        ?.content || "";

    const cuisineOnly =
      /^(italian|mexican|mediterranean|american|french|spanish|greek|vegan|vegetarian)$/i.test(
        userMessage.trim()
      );

    const wasAskedAboutMenu =
      /menu preference|type of cuisine|cuisine|what.*food|what.*menu|dishes.*mind/i.test(
        lastAssistantMessage
      );

    if (cuisineOnly && wasAskedAboutMenu) {
      return jsonResponse({
        answer:
          `Great choice! ${userMessage.trim()} gives me the cuisine direction, but I still need your actual food selections before we continue.

Here are Chef Maria's approved Italian menu options:

APPETIZERS
• Bruschetta al Pomodoro
• Caprese Salad
• Eggplant Parmigiana
• Arancini
• Italian Charcuterie Board
• Mini Quiches
• Focaccia

PASTA & RISOTTO
• Lasagna Bolognese
• White Vegetable Lasagna
• Tagliatelle Bolognese
• Penne alla Vodka
• Fresh Gnocchi
• Spinach Gnocchi Gorgonzola
• Risotto Shrimp & Zucchini
• Mushroom Risotto
• Orzotto with Peas & Speck

MAIN COURSES
• Chicken Marsala
• Chicken Piccata
• Chicken Milanese
• Chicken Limone
• Chicken Cacciatore
• Branzino Mediterraneo
• Short Ribs with Polenta
• Salmon Mediterranean Style

SIDES
• Roasted Potatoes
• Sautéed Spinach
• Zucchini Trifolati
• Broccoli au Gratin

DESSERTS
• Tiramisù
• Mini Cannoli
• Rustic Apple Cake
• Semifreddo Amaretto
• Mixed Berries with Zabaione

Please choose the dishes you'd like, or tell me "recommend a menu" and I'll help you build one.`
      });
    }

    const isConfirmation =
      /^(yes|yes please|yes everything is correct|correct|confirmed|confirm|looks good|that is correct|everything is correct|ok|okay|send it|submit|submit it|go ahead)$/i.test(
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
            "Thank you! Your request has been sent directly to Chef Maria.\n\nChef Maria will personally review availability and final pricing and contact you using the information you provided. This is an inquiry, not a confirmed booking yet.\n\nPhone: 561-692-1473\nEmail: cucinadiverona@gmail.com"
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
6. cuisine preference AND specific food/menu choices
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
- A cuisine name alone such as Italian, Mexican, Mediterranean, American, French, Spanish, or Greek is NOT a complete menu.
- After the customer gives a cuisine preference, ask what actual food they would like.
- Ask for specific menu selections such as appetizer, main course, sides, and dessert.
- If the customer does not know what to choose, offer to help with menu suggestions.
- When recommending Italian dishes, use Chef Maria's approved menu rather than inventing dishes.
- Approved appetizers: Bruschetta al Pomodoro, Caprese Salad, Eggplant Parmigiana, Arancini, Italian Charcuterie Board, Mini Quiches, Focaccia.
- Approved pasta and risotto: Lasagna Bolognese, White Vegetable Lasagna, Tagliatelle Bolognese, Penne alla Vodka, Fresh Gnocchi, Spinach Gnocchi Gorgonzola, Risotto Shrimp & Zucchini, Mushroom Risotto, Orzotto with Peas & Speck.
- Approved main courses: Chicken Marsala, Chicken Piccata, Chicken Milanese, Chicken Limone, Chicken Cacciatore, Branzino Mediterraneo, Short Ribs with Polenta, Salmon Mediterranean Style.
- Approved sides: Roasted Potatoes, Sautéed Spinach, Zucchini Trifolati, Broccoli au Gratin.
- Approved desserts: Tiramisù, Mini Cannoli, Rustic Apple Cake, Semifreddo Amaretto, Mixed Berries with Zabaione.
- Do not continue to allergies until the customer has provided specific food choices or explicitly says Chef Maria may choose/recommend the menu.
- Do not sound robotic.
- If the customer gives several details at once, acknowledge them and ask only for what is still missing.
- For groups over 10 guests, explain that Chef Maria may recommend catering or additional service staff.
- Never say that YOU are checking availability.
- Never say "I will check availability", "I will let you know", or "I will reach out later".
- Never imply that you are doing work in the background.
- After a request is actually submitted, Chef Maria will personally review availability and final pricing.
- When all booking details are collected, summarize the details and ask: "Please confirm that everything is correct so I can submit your inquiry to Chef Maria."
- Never say "we'll proceed with the booking." Say "submit your inquiry" instead.
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

function findAnswerAfterPrompt(history, promptPattern) {
  let answer = "";

  for (let i = 0; i < history.length - 1; i++) {
    const assistant = history[i];
    const user = history[i + 1];

    if (
      assistant?.role === "assistant" &&
      user?.role === "user" &&
      promptPattern.test(assistant.content || "")
    ) {
      const value = (user.content || "").trim();

      if (value) {
        answer = value;
      }
    }
  }

  return answer;
}


function extractBookingInfo(userMessage, history) {
  const userMessages = history
    .filter((item) => item.role === "user")
    .map((item) => item.content || "");

  const allUserText = [
    ...userMessages,
    userMessage
  ].join("\n");


  /*
   * GUEST COUNT
   */
  const guestAnswer =
    findAnswerAfterPrompt(
      history,
      /guest count|how many guests|number of guests|guests will be attending/i
    );

  const guestMatch =
    guestAnswer.match(/\b(\d{1,3})\b/) ||
    allUserText.match(
      /\b(\d{1,3})\s*(?:people|guests|persons|adults|children|kids)\b/i
    ) ||
    allUserText.match(
      /\b(?:party|group|event|dinner)\s+(?:for|of)\s+(\d{1,3})\b/i
    );


  /*
   * SERVICE TYPE
   */
  const serviceAnswer =
    findAnswerAfterPrompt(
      history,
      /type of service|which service|service are you looking for/i
    );

  const serviceSource =
    `${serviceAnswer}\n${allUserText}`;

  const serviceMatch =
    serviceSource.match(
      /\b(private chef|full[-\s]?service catering|drop[-\s]?off catering|drop[-\s]?off|cooking class|catering)\b/i
    );


  /*
   * LOCATION
   */
  const locationAnswer =
    findAnswerAfterPrompt(
      history,
      /city or location|city\/location|where .*service|event location|south florida.*location/i
    );

  const locationSource =
    `${locationAnswer}\n${allUserText}`;

  const cityMatch =
    locationSource.match(
      /\b(Miami Beach|Miami|Maimi|Fort Lauderdale|Boca Raton|West Palm Beach|Palm Beach|Deerfield Beach|Pompano Beach|Delray Beach|Hollywood|Aventura|Sunny Isles|Jupiter|Broward)\b/i
    );

  let cityLocation =
    cityMatch ? cityMatch[0] : "";

  if (/^maimi$/i.test(cityLocation)) {
    cityLocation = "Miami";
  }


  /*
   * DATE
   */
  const dateAnswer =
    findAnswerAfterPrompt(
      history,
      /provide the date|what date|date .*event|date you would like/i
    );

  const dateSource =
    `${dateAnswer}\n${allUserText}`;

  const dateMatch =
    dateSource.match(
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january\s+\d{1,2},?\s+\d{4}|february\s+\d{1,2},?\s+\d{4}|march\s+\d{1,2},?\s+\d{4}|april\s+\d{1,2},?\s+\d{4}|may\s+\d{1,2},?\s+\d{4}|june\s+\d{1,2},?\s+\d{4}|july\s+\d{1,2},?\s+\d{4}|august\s+\d{1,2},?\s+\d{4}|september\s+\d{1,2},?\s+\d{4}|october\s+\d{1,2},?\s+\d{4}|november\s+\d{1,2},?\s+\d{4}|december\s+\d{1,2},?\s+\d{4}/i
    );


  /*
   * TIME
   */
  const timeAnswer =
    findAnswerAfterPrompt(
      history,
      /what time|provide.*time|time .*start|service to start/i
    );

  const timeSource =
    `${timeAnswer}\n${allUserText}`;

  const timeMatch =
    timeSource.match(
      /\b(1[0-2]|0?[1-9])(?::[0-5][0-9])?\s*(?:am|pm)\b/i
    );


  /*
   * MENU
   *
   * This reads the customer's answer AFTER a menu question.
   * It no longer relies only on a small list of cuisine words.
   */
  let menuPreference =
    findAnswerAfterPrompt(
      history,
      /menu preference|type of cuisine|dishes in mind|what dishes|food choices|menu selections|appetizer|main course|side dishes|dessert|menus stand out|mix and match|which menu|what menu|menu options/i
    );

  if (
    /^(show me|give me|what are|some options|show options)/i.test(
      menuPreference
    )
  ) {
    menuPreference = "";
  }

  /*
   * A cuisine by itself is not enough.
   * We require actual dishes/menu choices before submission.
   */
  if (
    /^(italian|mexican|mediterranean|american|french|spanish|greek|vegan|vegetarian)$/i.test(
      menuPreference.trim()
    )
  ) {
    menuPreference = "";
  }


  /*
   * ALLERGIES / DIETARY RESTRICTIONS
   *
   * "no" now becomes "None".
   */
  let allergies =
    findAnswerAfterPrompt(
      history,
      /allergies|dietary restrictions|dietary needs/i
    );

  if (
    /^(no|none|nope|no allergies|no allergy|no restrictions|no dietary restrictions)$/i.test(
      allergies.trim()
    )
  ) {
    allergies = "None";
  }


  /*
   * NAME
   *
   * This fixes:
   *
   * Bot: "Please provide your name"
   * User: "keko derigor"
   */
  let name =
    findAnswerAfterPrompt(
      history,
      /provide your name|your name\?|may i have your name|what is your name/i
    );

  if (!name) {
    const nameDirect =
      allUserText.match(
        /my name is\s+([A-Za-z][A-Za-z .'-]{1,100})/i
      );

    if (nameDirect) {
      name = nameDirect[1].trim();
    }
  }


  /*
   * EMAIL
   */
  const emailAnswer =
    findAnswerAfterPrompt(
      history,
      /email address|provide your email|your email/i
    );

  const emailSource =
    `${emailAnswer}\n${allUserText}`
      .replace(/\\/g, "");

  const emailMatch =
    emailSource.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );


  /*
   * PHONE
   */
  const phoneAnswer =
    findAnswerAfterPrompt(
      history,
      /phone number|best phone|telephone|number to reach you/i
    );

  const phoneSource =
    `${phoneAnswer}\n${allUserText}`;

  const phoneMatch =
    phoneSource.match(
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
    );


  const info = {
    guests:
      guestMatch ? guestMatch[1] : "",

    serviceType:
      serviceMatch ? serviceMatch[0] : "",

    cityLocation,

    date:
      dateMatch ? dateMatch[0] : "",

    time:
      timeMatch ? timeMatch[0] : "",

    menuPreference:
      menuPreference.trim(),

    allergies:
      allergies.trim(),

    name:
      name.trim(),

    email:
      emailMatch ? emailMatch[0] : "",

    phone:
      phoneMatch ? phoneMatch[0] : ""
  };


  const readyToSend =
    Boolean(
      info.guests &&
      info.serviceType &&
      info.cityLocation &&
      info.date &&
      info.time &&
      info.menuPreference &&
      info.allergies &&
      info.name &&
      info.email &&
      info.phone
    );


  return {
    ...info,
    readyToSend
  };
}


function findMenuPreference(text) {
  const labeledMenu = text.match(
    /(?:menu preference|menu|cuisine)\s*:\s*([^\n\r]+)/i
  );

  if (labeledMenu) {
    return labeledMenu[1].trim();
  }

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
    "mexican",
    "french",
    "american",
    "mediterranean",
    "spanish",
    "greek",
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
