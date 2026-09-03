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

    const guestCount =
      Number.parseInt(bookingInfo.guests || "0", 10);

    if (
      guestCount > 10 &&
      bookingInfo.serviceType === "Private Chef"
    ) {
      return jsonResponse({
        answer:
          `For ${guestCount} guests, Chef Maria would not handle this as a standard private-chef dinner.

For groups over 10 guests, Chef Maria uses a catering format and additional service staff may be required.

Would you prefer:

1. Full-Service Catering
2. Drop-off Catering

Chef Maria will personally review the final event setup.`
      });
    }

    if (
      guestCount > 10 &&
      bookingInfo.serviceType === "Catering"
    ) {
      return jsonResponse({
        answer:
          `Absolutely. For ${guestCount} guests, I just need to clarify the catering format.

Would you prefer:

1. Full-Service Catering — Chef Maria and service staff handle the event on-site
2. Drop-off Catering — the prepared food is delivered for your event

Please choose Full-Service Catering or Drop-off Catering.`
      });
    }

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

    const wasAskedAboutAllergies =
      /allergies|dietary restrictions|dietary needs/i.test(
        lastAssistantMessage
      ) &&
      !/BOOKING INQUIRY SUMMARY|please confirm that everything is correct|reply YES to submit/i.test(
        lastAssistantMessage
      );

    const vagueAllergyReply =
      /^(yes|yeah|yep|ok|okay|ok that's good|okay that's good|thats good|that's good|sounds good|looks good|great|perfect|fine|correct)$/i.test(
        userMessage.trim()
      );

    if (wasAskedAboutAllergies && vagueAllergyReply) {
      return jsonResponse({
        answer:
          "Before we continue, I need a clear answer for allergies or dietary restrictions. Please say “none” if there are none, or list any allergies or dietary needs."
      });
    }

    const wasAskedForTime =
      /what time|provide.*time|time .*start|service to begin|service to start/i.test(
        lastAssistantMessage
      );

    const bareTimeReply =
      /^(1[0-2]|0?[1-9])(?::[0-5][0-9])?$/.test(
        userMessage.trim()
      );

    const combinedBareTimeMatch =
      userMessage.trim().match(
        /(?:^|\s)(1[0-2]|0?[1-9])(?::[0-5][0-9])?\s*$/
      );

    const currentMessageHasDate =
      /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/.test(userMessage);

    const ambiguousTime =
      (wasAskedForTime && bareTimeReply) ||
      (
        currentMessageHasDate &&
        combinedBareTimeMatch &&
        !/\b(am|pm)\b/i.test(userMessage)
      );

    if (ambiguousTime) {
      const timeValue =
        bareTimeReply
          ? userMessage.trim()
          : combinedBareTimeMatch[1];

      return jsonResponse({
        answer:
          `Thanks! Is that ${timeValue} AM or ${timeValue} PM?`
      });
    }

    /*
     * If the assistant specifically asked for the event time,
     * do not allow cuisine or another booking detail to skip it.
     */
    if (
      wasAskedForTime &&
      !bookingInfo.time
    ) {
      return jsonResponse({
        answer:
          "I still need the event time before we continue. Please provide a time with AM or PM, for example: 7 PM."
      });
    }

    const cuisineMatch =
      userMessage.match(
        /\b(italian|mexic(?:an|am|ain|n)|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean)\b/i
      );

    const cuisineMentioned = Boolean(cuisineMatch);

    let cuisineName = "";

    if (cuisineMatch) {
      const rawCuisine = cuisineMatch[1].toLowerCase();

      if (/^mexic/.test(rawCuisine)) {
        cuisineName = "Mexican";
      } else {
        cuisineName =
          rawCuisine.charAt(0).toUpperCase() +
          rawCuisine.slice(1);
      }
    }

    const wasAskedAboutMenu =
      /menu preference|type of cuisine|cuisine|what.*food|what.*menu|dishes.*mind/i.test(
        lastAssistantMessage
      );

    const bookingContextPresent =
      Boolean(
        bookingInfo.guests ||
        bookingInfo.serviceType ||
        bookingInfo.cityLocation ||
        bookingInfo.date ||
        bookingInfo.time
      );

    const nonItalianCuisineRequested =
      cuisineMentioned &&
      cuisineName &&
      cuisineName !== "Italian";

    if (
      nonItalianCuisineRequested &&
      (wasAskedAboutMenu || bookingContextPresent)
    ) {
      return jsonResponse({
        answer:
          `Great choice! ${cuisineName} cuisine sounds delicious. However, Chef Maria specializes in Italian cuisine, so this would be a special cuisine request.

Chef Maria will need to personally review the request and decide whether she can accommodate it. I don't want to promise a menu she hasn't approved.

If you have specific dishes in mind, please tell me what you'd like and I'll include them in your inquiry.

If you'd rather leave the menu up to Chef Maria, just say "Chef Maria can decide."`
      });
    }

    const specialCuisineReviewPrompt =
      /special cuisine request|specializes in Italian cuisine|personally review the request/i.test(
        lastAssistantMessage
      );

    const customerLeavesSpecialMenuToChef =
      /\b(you choose|you decide|chef maria can decide|chef maria may decide|choose for me|surprise me|whatever chef maria recommends)\b/i.test(
        userMessage
      );

    if (
      specialCuisineReviewPrompt &&
      customerLeavesSpecialMenuToChef
    ) {
      return jsonResponse({
        answer:
          "Absolutely. I'll record this as a special cuisine request for Chef Maria to personally review. I won't invent or promise a non-Italian menu on her behalf. Are there any allergies or dietary restrictions we should know about?"
      });
    }

    const specificDishMentioned =
      /\b(bruschetta|caprese|eggplant parmigiana|arancini|charcuterie|focaccia|lasagna|tagliatelle|penne|gnocchi|risotto|orzotto|chicken marsala|chicken piccata|chicken milanese|chicken limone|chicken cacciatore|branzino|short ribs|salmon|roasted potatoes|spinach|zucchini|broccoli|tiramisu|tiramisù|cannoli|apple cake|semifreddo|zabaione)\b/i.test(
        userMessage
      );

    if (
      cuisineMentioned &&
      (wasAskedAboutMenu || bookingContextPresent) &&
      !specificDishMentioned &&
      !/\b(you choose|help me choose|choose\s+for+\s+me|recommend(?: a menu| something)?|surprise me)\b/i.test(userMessage)
    ) {
      return jsonResponse({
        answer:
          `Great choice! ${cuisineMatch[1]} gives me the cuisine direction, but I still need your actual food selections before we continue.

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

    const asksSubmissionStatus =
      /\b(did you send|did it send|was it sent|did you submit|was it submitted|did it go through|has it been sent)\b/i.test(
        userMessage.trim()
      );

    if (asksSubmissionStatus) {
      const previousSubmissionResult =
        [...history]
          .reverse()
          .find(
            (item) =>
              item.role === "assistant" &&
              (
                /INQUIRY SENT SUCCESSFULLY/i.test(item.content || "") ||
                /YOUR INQUIRY WAS NOT SENT/i.test(item.content || "")
              )
          );

      if (
        previousSubmissionResult &&
        /INQUIRY SENT SUCCESSFULLY/i.test(
          previousSubmissionResult.content || ""
        )
      ) {
        return jsonResponse({
          answer:
            "Yes. Your inquiry was successfully emailed to Chef Maria."
        });
      }

      if (
        previousSubmissionResult &&
        /YOUR INQUIRY WAS NOT SENT/i.test(
          previousSubmissionResult.content || ""
        )
      ) {
        return jsonResponse({
          answer:
            "No. Your inquiry was not sent successfully. Please try again or contact Chef Maria directly at 561-692-1473 or cucinadiverona@gmail.com."
        });
      }

      return jsonResponse({
        answer:
          "I do not have confirmation that your inquiry was sent. It should only be considered sent after you see: INQUIRY SENT SUCCESSFULLY."
      });
    }

    const confirmationText =
      userMessage
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const awaitingFinalConfirmation =
      /please confirm that everything is correct|confirm.*submit your inquiry|final summary|summary of your inquiry|complete inquiry summary/i.test(
        lastAssistantMessage
      );

    const isConfirmation =
      /^(yes|yes please|yes correct|yes that is correct|yes thats correct|yes everything is correct|yes it is|yeah|yep|sure|correct|confirmed|confirm|looks good|looks perfect|everything looks good|that is correct|everything is correct|all good|ok|okay|ok send it|okay send it|yes send it|send it|please send it|submit|submit it|please submit|submit the inquiry|send the inquiry|go ahead|yes go ahead|proceed)$/i.test(
        confirmationText
      );

    if (isConfirmation && !bookingInfo.readyToSend) {
      const missingFields = [
        ["guest count", bookingInfo.guests],
        ["service type", bookingInfo.serviceType],
        ["location", bookingInfo.cityLocation],
        ["date", bookingInfo.date],
        ["time", bookingInfo.time],
        ["menu selections", bookingInfo.menuPreference],
        ["allergies or dietary restrictions", bookingInfo.allergies],
        ["name", bookingInfo.name],
        ["email", bookingInfo.email],
        ["phone", bookingInfo.phone]
      ]
        .filter(([, value]) => !value)
        .map(([label]) => label);

      return jsonResponse({
        answer:
          `I’m not able to submit your inquiry yet because I’m still missing: ${missingFields.join(", ")}. Please provide the missing information first.`
      });
    }

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
            "✓ INQUIRY SENT SUCCESSFULLY\n\nYour event information has been emailed directly to Chef Maria.\n\nChef Maria will personally review availability and final pricing and contact you using the email or phone number you provided.\n\nThis is an inquiry, not a confirmed booking yet.\n\nPhone: 561-692-1473\nEmail: cucinadiverona@gmail.com"
        });
      }

      return jsonResponse({
        answer:
          "IMPORTANT: YOUR INQUIRY WAS NOT SENT.\n\nThe email submission did not complete successfully. Please try again or contact Chef Maria directly.\n\nPhone: 561-692-1473\nEmail: cucinadiverona@gmail.com"
      });
    }

    if (
      bookingInfo.readyToSend &&
      !awaitingFinalConfirmation
    ) {
      const cuisineSummary =
        bookingInfo.specialCuisineReview
          ? `${bookingInfo.cuisinePreference} — SPECIAL CUISINE REQUEST, PENDING CHEF MARIA REVIEW`
          : bookingInfo.cuisinePreference || "Italian";

      return jsonResponse({
        answer:
          `BOOKING INQUIRY SUMMARY

Guest Count: ${bookingInfo.guests}
Service Type: ${bookingInfo.serviceType}
City / Location: ${bookingInfo.cityLocation}
Date: ${bookingInfo.date}
Time: ${bookingInfo.time}
Cuisine Preference: ${cuisineSummary}
Food / Menu Preferences: ${bookingInfo.menuPreference}
Allergies / Dietary Restrictions: ${bookingInfo.allergies}
Name: ${bookingInfo.name}
Email: ${bookingInfo.email}
Phone: ${bookingInfo.phone}

Please confirm that everything is correct so I can submit your inquiry to Chef Maria.

Reply YES to submit, or tell me what needs to be changed.`
      });
    }

    /*
     * Once the server has shown the final summary,
     * never allow the AI to pretend the inquiry was submitted.
     */
    if (
      awaitingFinalConfirmation &&
      !isConfirmation
    ) {
      const looksLikeCorrection =
        /\b(change|update|correct|correction|wrong|instead|actually|edit|replace|not correct|nope)\b/i.test(
          userMessage
        );

      if (!looksLikeCorrection) {
        return jsonResponse({
          answer:
            "Your inquiry has NOT been sent yet. Please reply YES to submit it to Chef Maria, or tell me what information needs to be changed."
        });
      }
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
- If you ask for a required booking detail and the customer answers with a different detail, acknowledge the extra information if useful but continue asking for the required missing detail.
- If event time is missing, do NOT move to cuisine, menu, allergies, contact information, summary, or confirmation until a valid time with AM or PM has been collected.
- NEVER show a booking summary or ask for final confirmation while ANY required booking field is still missing.
- Never ask for final confirmation while name, email, or phone is still missing.
- After allergies or dietary restrictions, collect name, then email, then phone.
- Only after ALL required booking information is collected should you show the final summary and ask for confirmation.
- A cuisine name alone such as Italian, Mexican, Mediterranean, American, French, Spanish, or Greek is NOT a complete menu.
- After the customer gives a cuisine preference, ask what actual food they would like.
- Ask for specific menu selections such as appetizer, main course, sides, and dessert.
- Chef Maria specializes in ITALIAN cuisine.
- Italian cuisine is Chef Maria's standard cuisine.
- If a customer requests Mexican, French, Spanish, Greek, Japanese, Thai, Indian, Chinese, Caribbean, Mediterranean, American, or another non-Italian cuisine, DO NOT say Chef Maria offers or accepts it automatically.
- For any non-Italian cuisine request, explain warmly that Chef Maria specializes in Italian cuisine and that Chef Maria must personally review the special request before deciding whether she can accommodate it.
- Never invent, recommend, or promise a non-Italian menu on Chef Maria's behalf.
- If a customer provides specific non-Italian dishes, preserve those exact requests in the inquiry for Chef Maria to review.
- If the customer has already provided specific non-Italian dishes, DO NOT ask them to choose an Italian menu afterward.
- After recording their special cuisine dishes, continue to allergies or dietary restrictions.
- If a customer says "you choose" for a non-Italian request, do NOT create a menu. Record that Chef Maria should decide whether she can accommodate the cuisine and, if so, choose the menu.
- In the final summary, clearly label non-Italian cuisine as "SPECIAL CUISINE REQUEST - PENDING CHEF MARIA REVIEW."
- If the customer does not know what to choose for an ITALIAN menu, offer Chef Maria's approved Italian suggestions.
- When recommending Italian dishes, use Chef Maria's approved menu rather than inventing dishes.
- Approved appetizers: Bruschetta al Pomodoro, Caprese Salad, Eggplant Parmigiana, Arancini, Italian Charcuterie Board, Mini Quiches, Focaccia.
- Approved pasta and risotto: Lasagna Bolognese, White Vegetable Lasagna, Tagliatelle Bolognese, Penne alla Vodka, Fresh Gnocchi, Spinach Gnocchi Gorgonzola, Risotto Shrimp & Zucchini, Mushroom Risotto, Orzotto with Peas & Speck.
- Approved main courses: Chicken Marsala, Chicken Piccata, Chicken Milanese, Chicken Limone, Chicken Cacciatore, Branzino Mediterraneo, Short Ribs with Polenta, Salmon Mediterranean Style.
- Approved sides: Roasted Potatoes, Sautéed Spinach, Zucchini Trifolati, Broccoli au Gratin.
- Approved desserts: Tiramisù, Mini Cannoli, Rustic Apple Cake, Semifreddo Amaretto, Mixed Berries with Zabaione.
- Do not continue to allergies until the customer has provided specific food choices or explicitly says Chef Maria may choose/recommend the menu.
- Do not sound robotic.
- If the customer gives several details at once, acknowledge them and ask only for what is still missing.
- Standard private-chef service is for up to 10 guests.
- For more than 10 guests, do NOT accept the event as a standard private-chef booking.
- Explain that the event requires a catering format and may require additional service staff.
- Ask whether the customer prefers Full-Service Catering or Drop-off Catering.
- Chef Maria will personally review the final event setup.
- Never say that YOU are checking availability.
- Never say "I will check availability", "I will let you know", or "I will reach out later".
- Never imply that you are doing work in the background.
- After a request is actually submitted, Chef Maria will personally review availability and final pricing.
- When all booking details are collected, summarize the details and ask: "Please confirm that everything is correct so I can submit your inquiry to Chef Maria."
- Never say "we'll proceed with the booking." Say "submit your inquiry" instead.
- Do not say the booking is final until the customer confirms.
- Never claim that an inquiry was submitted, emailed, sent, or is being submitted.
- Never say "I will submit your inquiry", "I have submitted it", "I sent it", or similar.
- Only the server is allowed to submit an inquiry.
- An inquiry is sent ONLY when the server returns "INQUIRY SENT SUCCESSFULLY".
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

    const aiAnswer =
      aiData.choices?.[0]?.message?.content ||
      "How may I help you plan your Chef Maria experience?";

    /*
     * Final summaries are controlled by the server.
     * Never allow the AI to show an incomplete summary.
     */
    const aiLooksLikeFinalSummary =
      /summary of your inquiry|booking inquiry summary|here(?:'|’)?s a summary|here is a summary|please confirm that everything is correct/i.test(
        aiAnswer
      );

    if (
      aiLooksLikeFinalSummary &&
      !bookingInfo.readyToSend
    ) {
      const missingFields = [
        ["guest count", bookingInfo.guests],
        ["service type", bookingInfo.serviceType],
        ["location", bookingInfo.cityLocation],
        ["date", bookingInfo.date],
        ["time", bookingInfo.time],
        ["menu selections", bookingInfo.menuPreference],
        ["allergies or dietary restrictions", bookingInfo.allergies],
        ["name", bookingInfo.name],
        ["email", bookingInfo.email],
        ["phone", bookingInfo.phone]
      ]
        .filter(([, value]) => !value)
        .map(([label]) => label);

      const firstMissing =
        missingFields[0] || "booking information";

      return jsonResponse({
        answer:
          `Before I can show the final booking summary, I still need: ${missingFields.join(", ")}. Let's continue with ${firstMissing}.`
      });
    }

    return jsonResponse({
      answer: aiAnswer
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

    const assistantText = assistant?.content || "";

    const isSummary =
      /summary|details so far|what we have so far|final summary|complete summary|confirm that everything|confirm if everything/i.test(
        assistantText
      );

    if (
      assistant?.role === "assistant" &&
      user?.role === "user" &&
      !isSummary &&
      promptPattern.test(assistantText)
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

  const cuisineMatch =
    allUserText.match(
      /\b(italian|mexic(?:an|am|ain|n)|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean)\b/i
    );

  let cuisinePreference = "";

  if (cuisineMatch) {
    const rawCuisine =
      cuisineMatch[1].toLowerCase();

    if (/^mexic/.test(rawCuisine)) {
      cuisinePreference = "Mexican";
    } else {
      cuisinePreference =
        rawCuisine.charAt(0).toUpperCase() +
        rawCuisine.slice(1);
    }
  }

  const specialCuisineReview =
    Boolean(
      cuisinePreference &&
      cuisinePreference !== "Italian"
    );


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
    ) ||
    allUserText.match(
      /\b(?:book(?:ing)?\s+)?(?:a\s+)?party\s+(\d{1,3})\b/i
    );


  /*
   * SERVICE TYPE
   */
  const serviceAnswer =
    findAnswerAfterPrompt(
      history,
      /type of service|which service|service are you looking for/i
    );

  let serviceType = "";

  const servicePattern =
    /\b(private chef|full[-\s]?service catering|drop[-\s]?off catering|drop[-\s]?off|cooking class|catering|cataring|chef)\b/gi;

  const serviceCandidates = [
    ...userMessages,
    userMessage
  ];

  for (let i = serviceCandidates.length - 1; i >= 0; i--) {
    const text = serviceCandidates[i] || "";
    const matches = [...text.matchAll(servicePattern)];

    if (!matches.length) {
      continue;
    }

    const rawService =
      matches[matches.length - 1][0].toLowerCase();

    if (rawService === "chef" || rawService === "private chef") {
      serviceType = "Private Chef";
    } else if (rawService === "catering" || rawService === "cataring") {
      serviceType = "Catering";
    } else if (/full[-\s]?service catering/i.test(rawService)) {
      serviceType = "Full-Service Catering";
    } else if (/drop[-\s]?off/i.test(rawService)) {
      serviceType = "Drop-off Catering";
    } else if (rawService === "cooking class") {
      serviceType = "Cooking Class";
    }

    break;
  }

  /*
   * If the bot just asked the customer to choose
   * Full-Service Catering or Drop-off Catering,
   * allow simple replies such as "1" or "2".
   */
  const lastAssistantForService =
    [...history]
      .reverse()
      .find((item) => item.role === "assistant")
      ?.content || "";

  const choosingCateringFormat =
    /full-service catering|full service catering/i.test(
      lastAssistantForService
    ) &&
    /drop-off catering|drop off catering/i.test(
      lastAssistantForService
    );

  if (choosingCateringFormat) {
    const serviceChoice =
      userMessage
        .toLowerCase()
        .trim();

    if (
      /^(1|full service|full-service|full service catering|full-service catering)$/.test(
        serviceChoice
      )
    ) {
      serviceType = "Full-Service Catering";
    }

    if (
      /^(2|drop off|drop-off|drop off catering|drop-off catering)$/.test(
        serviceChoice
      )
    ) {
      serviceType = "Drop-off Catering";
    }
  }

  /*
   * Remember a previous 1 / 2 catering selection.
   * Without this, the parser forgets the choice on the next turn.
   */
  for (let i = history.length - 2; i >= 0; i--) {
    const assistant = history[i];
    const user = history[i + 1];

    if (
      assistant?.role !== "assistant" ||
      user?.role !== "user"
    ) {
      continue;
    }

    const assistantText =
      assistant.content || "";

    const askedCateringChoice =
      /full-service catering|full service catering/i.test(
        assistantText
      ) &&
      /drop-off catering|drop off catering/i.test(
        assistantText
      );

    if (!askedCateringChoice) {
      continue;
    }

    const previousChoice =
      (user.content || "")
        .toLowerCase()
        .trim();

    if (
      /^(1|full service|full-service|full service catering|full-service catering)$/.test(
        previousChoice
      )
    ) {
      serviceType = "Full-Service Catering";
      break;
    }

    if (
      /^(2|drop off|drop-off|drop off catering|drop-off catering)$/.test(
        previousChoice
      )
    ) {
      serviceType = "Drop-off Catering";
      break;
    }
  }

  /*
   * The CURRENT reply always wins if the customer changes
   * from option 1 to 2 or from option 2 to 1.
   */
  if (choosingCateringFormat) {
    const currentChoice =
      userMessage
        .toLowerCase()
        .trim();

    if (
      /^(1|full service|full-service|full service catering|full-service catering)$/.test(
        currentChoice
      )
    ) {
      serviceType = "Full-Service Catering";
    }

    if (
      /^(2|drop off|drop-off|drop off catering|drop-off catering)$/.test(
        currentChoice
      )
    ) {
      serviceType = "Drop-off Catering";
    }
  }


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
      /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january\s+\d{1,2},?\s+\d{4}|february\s+\d{1,2},?\s+\d{4}|march\s+\d{1,2},?\s+\d{4}|april\s+\d{1,2},?\s+\d{4}|may\s+\d{1,2},?\s+\d{4}|june\s+\d{1,2},?\s+\d{4}|july\s+\d{1,2},?\s+\d{4}|august\s+\d{1,2},?\s+\d{4}|september\s+\d{1,2},?\s+\d{4}|october\s+\d{1,2},?\s+\d{4}|november\s+\d{1,2},?\s+\d{4}|december\s+\d{1,2},?\s+\d{4}/i
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
   * Preserve dishes selected by the customer OR
   * dishes recommended by Chef Maria AI.
   */
  let menuPreference =
    findAnswerAfterPrompt(
      history,
      /menu preference|type of cuisine|dishes in mind|what dishes|food choices|menu selections|appetizer|main course|side dishes|dessert|menus stand out|mix and match|which menu|what menu|menu options/i
    );

  if (
    /^(show me|give me|what are|some options|show options)$/i.test(
      menuPreference.trim()
    )
  ) {
    menuPreference = "";
  }

  if (
    /^(italian|mexic(?:an|am|ain|n)|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean)$/i.test(
      menuPreference.trim()
    )
  ) {
    menuPreference = "";
  }

  const approvedDishMatchers = [
    ["Bruschetta al Pomodoro", /\bbruschetta(?: al pomodoro)?\b/i],
    ["Caprese Salad", /\bcaprese(?: salad)?\b/i],
    ["Eggplant Parmigiana", /\beggplant parmigiana\b/i],
    ["Arancini", /\barancini\b/i],
    ["Italian Charcuterie Board", /\bitalian charcuterie board\b/i],
    ["Mini Quiches", /\bmini quiches?\b/i],
    ["Focaccia", /\b(?:focaccia|ocaccia)\b/i],

    ["Lasagna Bolognese", /\blasagna bolognese\b/i],
    ["White Vegetable Lasagna", /\bwhite vegetable lasagna\b/i],
    ["Tagliatelle Bolognese", /\btagliatelle bolognese\b/i],
    ["Penne alla Vodka", /\bpenne alla vodka\b/i],
    ["Fresh Gnocchi", /\bfresh gnocchi\b/i],
    ["Spinach Gnocchi Gorgonzola", /\bspinach gnocchi gorgonzola\b/i],
    ["Risotto Shrimp & Zucchini", /\brisotto shrimp\s*(?:&|and)\s*zucchini\b/i],
    ["Mushroom Risotto", /\bmushroom risotto\b/i],
    ["Orzotto with Peas & Speck", /\borzotto with peas\s*(?:&|and)\s*speck\b/i],

    ["Chicken Marsala", /\bchicken marsala\b/i],
    ["Chicken Piccata", /\bchicken piccata\b/i],
    ["Chicken Milanese", /\bchicken milanese\b/i],
    ["Chicken Limone", /\bchicken limone\b/i],
    ["Chicken Cacciatore", /\bchicken cacciatore\b/i],
    ["Branzino Mediterraneo", /\bbranzino mediterraneo\b/i],
    ["Short Ribs with Polenta", /\bshort ribs with polenta\b/i],
    ["Salmon Mediterranean Style", /\bsalmon mediterranean style\b/i],

    ["Roasted Potatoes", /\broasted potatoes\b/i],
    ["Sautéed Spinach", /\b(?:sautéed|sauteed) spinach\b/i],
    ["Zucchini Trifolati", /\bzucchini trifolati\b/i],
    ["Broccoli au Gratin", /\bbroccoli au gratin\b/i],

    ["Tiramisù", /\btiramis(?:u|ù)\b/i],
    ["Mini Cannoli", /\bmini cannoli\b/i],
    ["Rustic Apple Cake", /\brustic apple cake\b/i],
    ["Semifreddo Amaretto", /\bsemifreddo amaretto\b/i],
    ["Mixed Berries with Zabaione", /\bmixed berries with zabaione\b/i]
  ];

  const customerSelectedDishes =
    approvedDishMatchers
      .filter(([, pattern]) => pattern.test(allUserText))
      .map(([dish]) => dish);

  /*
   * If customer asked Chef Maria AI to choose,
   * find the latest ACTUAL recommended menu.
   *
   * Ignore the giant master menu/options message.
   */
  let assistantSelectedDishes = [];

  const assistantMessages =
    history
      .filter((item) => item.role === "assistant")
      .map((item) => item.content || "");

  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const text = assistantMessages[i];

    if (
      /approved Italian menu options|Please choose the dishes you'd like/i.test(
        text
      )
    ) {
      continue;
    }

    const dishes =
      approvedDishMatchers
        .filter(([, pattern]) => pattern.test(text))
        .map(([dish]) => dish);

    if (dishes.length > 0) {
      assistantSelectedDishes = dishes;
      break;
    }
  }

  let combinedSpecialCuisineFood = "";

  const specialCuisineMessages = [
    ...userMessages,
    userMessage
  ];

  for (let i = specialCuisineMessages.length - 1; i >= 0; i--) {
    const text =
      specialCuisineMessages[i] || "";

    const match =
      text.match(
        /\b(mexic(?:an|am|ain|n)|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean)\b\s*[:,-]?\s*(.+)$/i
      );

    if (!match) {
      continue;
    }

    const foodText =
      (match[2] || "").trim();

    if (
      foodText &&
      !/^(food|menu|cuisine|please|thanks|thank you)$/i.test(
        foodText
      )
    ) {
      combinedSpecialCuisineFood =
        foodText;
      break;
    }
  }

  const specialCuisineFoodAnswer =
    findAnswerAfterPrompt(
      history,
      /specific dishes|dishes in mind|what.*dishes|food.*would like|food.*you.*like|menu.*would like/i
    );

  const specialCuisineFoodIsReal =
    specialCuisineFoodAnswer &&
    !/^(italian|mexic(?:an|am|ain|n)|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean)$/i.test(
      specialCuisineFoodAnswer.trim()
    ) &&
    !/^(you choose|you decide|chef maria can decide|chef maria may decide|choose for me|surprise me|whatever chef maria recommends|all of them|everything|ok|okay|yes|great|sounds good)$/i.test(
      specialCuisineFoodAnswer.trim()
    );

  if (
    specialCuisineReview &&
    specialCuisineFoodIsReal
  ) {
    menuPreference =
      specialCuisineFoodAnswer.trim();
  } else if (
    specialCuisineReview &&
    combinedSpecialCuisineFood
  ) {
    menuPreference =
      combinedSpecialCuisineFood;
  } else if (customerSelectedDishes.length > 0) {
    menuPreference =
      customerSelectedDishes.join(", ");
  } else if (assistantSelectedDishes.length > 0) {
    menuPreference =
      assistantSelectedDishes.join(", ");
  }

  const customerDelegatedSpecialMenu =
    /\b(you choose|you decide|chef maria can decide|chef maria may decide|choose for me|surprise me|whatever chef maria recommends)\b/i.test(
      allUserText
    );

  if (
    specialCuisineReview &&
    customerDelegatedSpecialMenu &&
    !customerSelectedDishes.length
  ) {
    menuPreference =
      `Special ${cuisinePreference} cuisine request — customer asks Chef Maria to review whether she can accommodate it and choose the menu.`;
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
    /^(no+|nope+|none|nah|npo|no allergies|no allergy|no restrictions|no dietary restrictions)$/i.test(
      allergies.trim()
    )
  ) {
    allergies = "None";
  } else if (
    /^(yes|yeah|yep|ok|okay|ok that's good|okay that's good|thats good|that's good|sounds good|looks good|great|perfect|fine|correct)$/i.test(
      allergies.trim()
    )
  ) {
    allergies = "";
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
      /provide.*name|your name\?|may i have your name|what is your name/i
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


  if (name && /[,;|@]/.test(name)) {
    name = name.split(/[,;|]/)[0].trim();
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

    serviceType,

    cityLocation,

    date:
      dateMatch ? dateMatch[0] : "",

    time:
      timeMatch ? timeMatch[0] : "",

    cuisinePreference,

    specialCuisineReview,

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
    <p><strong>Cuisine preference:</strong> ${bookingInfo.cuisinePreference || "Not provided"}</p>
    <p><strong>Food / Menu preferences:</strong> ${bookingInfo.menuPreference || "Not provided"}</p>
    <p><strong>Special cuisine review required:</strong> ${bookingInfo.specialCuisineReview ? "YES - Chef Maria must personally approve this cuisine request" : "No"}</p>
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
