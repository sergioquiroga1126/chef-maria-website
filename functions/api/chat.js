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

    /*
     * LARGE EVENT GUARD
     *
     * 1-10 guests: standard private-chef range.
     * 11-100 guests: catering.
     * More than 100 guests: direct Chef Maria review.
     */
    const lastAssistantBeforeBooking =
      [...history]
        .reverse()
        .find((item) => item.role === "assistant")
        ?.content || "";

    /*
     * A customer may change the guest count after we have already
     * moved to the catering-choice question.
     */
    // Only when the bot's last message is really asking about the guest count or the
    // catering format. A recap that lists "Guest Count: 9" is not a question.
    const guestCountContext =
      /guest count|how many guests|number of guests|guests will be attending|full-service catering|full service catering|drop-off catering|drop off catering|catering format/i.test(
        lastAssistantBeforeBooking
      ) &&
      !looksLikeFieldList(lastAssistantBeforeBooking) &&
      !/recap|so we have|details so far|details we have|we have so far/i.test(lastAssistantBeforeBooking);

    /*
     * Accept thousands separators such as "1,000" or "1 000 000",
     * but do not merge unrelated numbers such as "12/20/2026, 40 guests".
     */
    const explicitGuestCountMatch =
      userMessage.match(
        /\b(\d{1,3}(?:[.,\s]\d{3})+|\d+)\s*(?:people|guests?|gusts?|persons?|adults?|kids?|children)\b/i
      );

    const correctedGuestCountMatch =
      guestCountContext
        ? userMessage.trim().match(
            /^(?:actually\s+|change(?:\s+it)?\s+to\s+|make\s+it\s+)?([\d.,\s]+)$/i
          )
        : null;

    // A bare number of seven or more digits is a phone number or similar, never a guest count.
    const bareGuestCountText =
      (correctedGuestCountMatch?.[1] || "").replace(/\D/g, "").length >= 7
        ? ""
        : correctedGuestCountMatch?.[1] || "";

    const guestCountText =
      explicitGuestCountMatch?.[1] ||
      bareGuestCountText ||
      "";

    const guestCountDigits =
      guestCountText.replace(/\D/g, "");

    if (guestCountDigits) {
      try {
        const requestedGuestCount =
          BigInt(guestCountDigits);

        if (requestedGuestCount > 100n) {
          return jsonResponse({
            answer:
              "Events with more than 100 guests require direct review by Chef Maria and cannot be completed through the automated booking assistant. Please contact Chef Maria at 561-692-1473 or cucinadiverona@gmail.com so she can personally review the event requirements."
          });
        }
      } catch {
        return jsonResponse({
          answer:
            "Please provide a valid guest count so I can help with your event."
        });
      }
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
     * EVENT TYPE / OCCASION
     *
     * After guest count and service type, require the customer
     * to tell us what kind of event they are planning.
     */
    if (
      bookingInfo.guests &&
      bookingInfo.serviceType &&
      !bookingInfo.eventType
    ) {
      return jsonResponse({
        answer:
          "What type of event is this? For example: birthday, anniversary, family dinner, corporate event, graduation, wedding, or another occasion."
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

    /*
     * Dietary restrictions are only for HUMAN guests.
     * Do not accept pet meal requests or pet allergies
     * as part of a Chef Maria booking.
     */
    const petDietaryRequest =
      /\b(dog|cat|pet|puppy|kitten|animal)\b/i.test(
        userMessage
      ) &&
      /\b(gluten|glutten|gluten[- ]?free|allerg(?:y|ic|ies)|diet|dietary|food|meal|peanut|nuts?|dairy|chocolate|shellfish)\b/i.test(
        userMessage
      );

    if (
      wasAskedAboutAllergies &&
      petDietaryRequest
    ) {
      return jsonResponse({
        answer:
          "Chef Maria’s dietary accommodations are for human guests only. Pet meals and pet dietary requests are not part of the catering service. Please list allergies or dietary restrictions for the people attending, or say “none” if there are none."
      });
    }

    if (wasAskedAboutAllergies && vagueAllergyReply) {
      return jsonResponse({
        answer:
          "Before we continue, I need a clear answer for allergies or dietary restrictions. Please say “none” if there are none, or list any allergies or dietary needs."
      });
    }

    /*
     * CONTACT VALIDATION
     *
     * Do not let the AI verbally accept invalid contact information.
     */
    /*
     * Server result messages mention "email" and "phone number",
     * but they are not asking the customer for contact details.
     */
    const lastMessageIsServerResult =
      /INQUIRY SENT SUCCESSFULLY|YOUR INQUIRY WAS NOT SENT|BOOKING INQUIRY SUMMARY|more than 100 guests/i.test(
        lastAssistantMessage
      );

    // Only treat the bot as "waiting for an email" when its last message is
    // actually asking for one, not when it merely mentions the word
    // ("Thank you for the email address..." or a recap listing "Email: ...").
    const wasAskedForEmail =
      !lastMessageIsServerResult &&
      /\be-?mail\b/i.test(
        lastRequestSentence(lastAssistantMessage)
      );

    const currentEmailMatch =
      userMessage.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
      );

    /*
     * Only treat a message as an email correction when the customer
     * is giving THEIR email, not asking "can you email me the menu?"
     */
    const emailCorrectionAttempt =
      /@/.test(userMessage) ||
      /\b(?:my|new|correct|change|update|wrong)\b[^.?!]*\b(?:email|e-mail)\b/i.test(
        userMessage
      );

    // The bot sometimes repeats an email back ("...your email is a@b.com, correct?").
    // A plain "yes" to that is a valid answer. The address itself comes from the
    // customer's earlier message.
    const confirmingShownEmail =
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
        lastRequestSentence(lastAssistantMessage)
      ) &&
      /^(?:yes|yeah|yep|yup|correct|that's right|that is right|right|y)\b/i.test(
        userMessage.trim()
      );

    if (
      (wasAskedForEmail || emailCorrectionAttempt) &&
      !currentEmailMatch &&
      !confirmingShownEmail
    ) {
      return jsonResponse({
        answer:
          "That email address does not look complete. Please enter a valid email address, for example: name@example.com."
      });
    }

    // Only treat the bot as "waiting for a phone number" when its last message
    // actually asks for one, not when it mentions the word in a thank-you or recap.
    const wasAskedForPhone =
      !lastMessageIsServerResult &&
      (/\b(?:phone|telephone|number to reach you)\b/i.test(
        lastRequestSentence(lastAssistantMessage)
      ) ||
        /\bvalid 10-digit\b/i.test(lastAssistantMessage));

    /*
     * Only treat a message as a phone correction when the customer
     * is giving THEIR number, not asking for Chef Maria's number.
     */
    const phoneCorrectionAttempt =
      /\b(?:my|new|correct|change|update|wrong)\b[^.?!]*\b(?:phone|telephone|cell|mobile|number)\b/i.test(
        userMessage
      ) &&
      (userMessage.match(/\d/g) || []).length >= 7;

    const currentPhoneMatch =
      userMessage.match(
        /(?<!\d)(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})(?!\d)/
      );

    let currentPhoneIsValid = false;

    if (currentPhoneMatch) {
      const area = currentPhoneMatch[1];
      const exchange = currentPhoneMatch[2];
      const digits =
        `${area}${exchange}${currentPhoneMatch[3]}`;

      currentPhoneIsValid =
        /^[2-9]\d{2}$/.test(area) &&
        /^[2-9]\d{2}$/.test(exchange) &&
        !/^(\d)\1{9}$/.test(digits);
    }

    // Same for a phone number the bot repeated back ("...your phone number is 954-909-9734, correct?").
    const confirmingShownPhone =
      /(?<!\d)\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/.test(
        lastRequestSentence(lastAssistantMessage)
      ) &&
      /^(?:yes|yeah|yep|yup|correct|that's right|that is right|right|y)\b/i.test(
        userMessage.trim()
      );

    if (
      (wasAskedForPhone || phoneCorrectionAttempt) &&
      !currentPhoneIsValid &&
      !confirmingShownPhone
    ) {
      return jsonResponse({
        answer:
          "Please enter a valid 10-digit U.S. phone number, for example: 561-555-0123."
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
• Mini Pizzas
• Polenta with Brie and Mushrooms
• Seafood Salad
• Caprese Kabobs

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
• Spaghetti Marinara
• Spaghetti Carbonara
• Squash Gnocchi
• Tagliatelle al Pesto
• Rigatoni Brie with Mushrooms & Walnuts
• Creamy Rigatoni with Speck & Zucchini
• Risotto con Radicchio e Amarone
• Linguine al Pesto
• Bucatini Amatriciana
• Linguine with Seafood
• Linguine with Clam Sauce
• Seafood Risotto

MAIN COURSES
• Chicken Marsala
• Chicken Piccata
• Chicken Milanese
• Chicken Limone
• Chicken Cacciatore
• Branzino Mediterraneo
• Short Ribs with Polenta
• Salmon Mediterranean Style
• Veal Saltimbocca
• Ossobuco
• Broiled Lamb Chops
• Veal Milanese
• Veal Piccata

FISH
• Marinated Trout
• Baked Snapper Mediterraneo
• Whole Fish in Cartoccio
• Branzino Oreganato

SIDES
• Roasted Potatoes
• Sautéed Spinach
• Zucchini Trifolati
• Broccoli au Gratin
• Mixed Salad
• Fennel Gratiné

DESSERTS
• Tiramisù
• Mini Cannoli
• Rustic Apple Cake
• Semifreddo Amaretto
• Mixed Berries with Zabaione
• Cold Hazelnut Cake
• Puff Pastry Apple Wheels
• Fruit Tart or Marmalade Tart
• Strudel di Mele
• Nutella Pockets
• Affogato al Caffè
• Gelato with Warm Berries
• Lava Cake with Gelato
• Amaretto Ice Cream

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
        ["type of event", bookingInfo.eventType],
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

    const looksLikeCorrection =
      /\b(change|update|correct|correction|wrong|instead|actually|edit|replace|not correct|nope)\b/i.test(
        userMessage
      );

    /*
     * Only submit when the customer is replying to the summary
     * they just saw. Otherwise show the current summary first.
     */
    if (
      isConfirmation &&
      bookingInfo.readyToSend &&
      awaitingFinalConfirmation
    ) {
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
      (!awaitingFinalConfirmation || looksLikeCorrection)
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
Event Type: ${bookingInfo.eventType}
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
3. type of event / occasion
4. city/location
5. date
6. time
7. cuisine preference AND specific food/menu choices
8. allergies or dietary restrictions
9. name
10. email
11. phone

Chef Maria service area:
Miami, Fort Lauderdale, Boca Raton, Palm Beach, Broward County, and South Florida.

Tone:
Warm, elegant, helpful, concise.

Client and event conduct:
- Chef Maria welcomes clients without making assumptions or distinctions based on sexual orientation, gender identity, relationship status, race, religion, or similar personal characteristics.
- If asked whether Chef Maria serves gay, lesbian, LGBTQ+, straight, or similar events, answer neutrally that Chef Maria welcomes all clients and events subject to the same service area, availability, event requirements, and personal review.
- Do not debate, praise, criticize, or make social or political claims about a customer's sexual orientation or about whether a city or community is gay, straight, LGBTQ-friendly, conservative, liberal, or similar.
- If the customer makes insults, provocative comments, or unrelated personal remarks, do not argue. Briefly redirect to the event details.
- Events involving nudity or other unusual working conditions are NOT automatically accepted. Explain that those conditions must be disclosed and personally reviewed by Chef Maria before she or any staff can accept the event.
- Do not imply that an unusual event condition has been approved merely because the customer is willing to pay more.
- Payment offers do not override Chef Maria's service area, safety requirements, staffing requirements, or personal review.

Booking rules:
- Ask for one missing booking detail at a time.
- Type of event / occasion is REQUIRED. Examples include birthday, anniversary, family dinner, corporate event, graduation, wedding, retirement party, baby shower, or another celebration.
- After service type, ask what type of event or occasion this is before moving to location.
- If you ask for a required booking detail and the customer answers with a different detail, acknowledge the extra information if useful but continue asking for the required missing detail.
- If event time is missing, do NOT move to cuisine, menu, allergies, contact information, summary, or confirmation until a valid time with AM or PM has been collected.
- NEVER show a booking summary or ask for final confirmation while ANY required booking field is still missing.
- Never ask for final confirmation while name, email, or phone is still missing.
- After allergies or dietary restrictions, collect name, then email, then phone.
- Allergies and dietary restrictions apply ONLY to human guests attending the event.
- Do NOT accept, record, accommodate, recommend, or offer food for dogs, cats, pets, or other animals.
- If a customer gives a pet dietary request such as "my dog is gluten free", explain that pet meals are not part of Chef Maria's service and ask again for dietary restrictions for the human guests.
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
- Approved appetizers: Bruschetta al Pomodoro, Caprese Salad, Eggplant Parmigiana, Arancini, Italian Charcuterie Board, Mini Quiches, Focaccia, Mini Pizzas, Polenta with Brie and Mushrooms, Seafood Salad, Caprese Kabobs.
- Approved pasta and risotto: Lasagna Bolognese, White Vegetable Lasagna, Tagliatelle Bolognese, Penne alla Vodka, Fresh Gnocchi, Spinach Gnocchi Gorgonzola, Risotto Shrimp & Zucchini, Mushroom Risotto, Orzotto with Peas & Speck, Spaghetti Marinara, Spaghetti Carbonara, Squash Gnocchi, Tagliatelle al Pesto, Rigatoni Brie with Mushrooms & Walnuts, Creamy Rigatoni with Speck & Zucchini, Risotto con Radicchio e Amarone, Linguine al Pesto, Bucatini Amatriciana, Linguine with Seafood, Linguine with Clam Sauce, Seafood Risotto.
- Approved main courses: Chicken Marsala, Chicken Piccata, Chicken Milanese, Chicken Limone, Chicken Cacciatore, Branzino Mediterraneo, Short Ribs with Polenta, Salmon Mediterranean Style, Veal Saltimbocca, Ossobuco, Broiled Lamb Chops, Veal Milanese, Veal Piccata.
- Approved fish: Marinated Trout, Baked Snapper Mediterraneo, Whole Fish in Cartoccio, Branzino Oreganato.
- Approved sides: Roasted Potatoes, Sautéed Spinach, Zucchini Trifolati, Broccoli au Gratin, Mixed Salad, Fennel Gratiné.
- Approved desserts: Tiramisù, Mini Cannoli, Rustic Apple Cake, Semifreddo Amaretto, Mixed Berries with Zabaione, Cold Hazelnut Cake, Puff Pastry Apple Wheels, Fruit Tart or Marmalade Tart, Strudel di Mele, Nutella Pockets, Affogato al Caffè, Gelato with Warm Berries, Lava Cake with Gelato, Amaretto Ice Cream.
- Do not continue to allergies until the customer has provided specific food choices or explicitly says Chef Maria may choose/recommend the menu.
- Do not sound robotic.
- If the customer gives several details at once, acknowledge them and ask only for what is still missing.
- Never describe an unusually large guest count as "realistic" or automatically acceptable.
- Events of 1,000 or more guests must be referred for direct Chef Maria review and must not continue through automated booking.
- Never describe an unusually large guest count as automatically acceptable or realistic.
- Events with more than 100 guests require direct Chef Maria review and must not continue through automated booking.
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

    const aiAnswer = (
      aiData.choices?.[0]?.message?.content ||
      "How may I help you plan your Chef Maria experience?"
    ).replace(/privatechefmaria\.com/gi, "mariaprivatechef.com");

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
        ["type of event", bookingInfo.eventType],
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
          // Keep this wording free of "summary" and "recap": the code that records the
          // customer's answers skips any message containing those words.
          `Almost there!\n\n${nextQuestionFor(firstMissing)}`
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

// True for a message that lists several "- Label: value" lines, such as a recap
// ("So we have: - Guest count: 9 - Time: 7 PM ..."). Such a message is never a question.
function looksLikeFieldList(text) {
  return (String(text || "").match(/^\s*(?:[-•*]|\d+[.)])\s*[A-Za-z][A-Za-z /&]{2,40}:/gm) || []).length >= 3;
}

// The last sentence of a bot message that actually asks for something. A message such as
// "I still need your name and to confirm your email. Could you please provide your name?"
// is asking for the name, not the email.
function lastRequestSentence(text) {
  const sentences = String(text || "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const asks = sentences.filter((sentence) =>
    /\?|\b(?:please|provide|enter|share|give|send|tell me|confirm|what|may i have|can i (?:get|have))\b/i.test(sentence)
  );

  return asks.length ? asks[asks.length - 1] : "";
}

// A plain person's name: letters, spaces, apostrophes, hyphens, and a period only after an
// initial ("J. Smith"). Digits, "@" and domains such as "yahoo.com" are not names, and
// neither are answers like "yes" or "none".
function isPlainName(value) {
  const text = String(value || "").trim();

  return (
    /^[\p{L}](?:[\p{L} '’-]|\.(?=\s|$)){1,59}$/u.test(text) &&
    !/^(?:yes|yeah|yep|no|nope|none|ok|okay|sure|thanks|thank you|correct|cancel|stop)$/i.test(text)
  );
}

function findAnswerAfterPrompt(history, promptPattern) {
  let answer = "";

  for (let i = 0; i < history.length - 1; i++) {
    const assistant = history[i];
    const user = history[i + 1];

    const assistantText = assistant?.content || "";

    const isSummary =
      /summary|recap|details so far|details we have|what we have so far|we have so far|final summary|complete summary|confirm that everything|confirm if everything/i.test(
        assistantText
      );

    if (
      assistant?.role === "assistant" &&
      user?.role === "user" &&
      !isSummary &&
      !looksLikeFieldList(assistantText) &&
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


// The question the bot should ask next, worded so the customer's answer is recognized.
function nextQuestionFor(missingField) {
  const questions = {
    "guest count": "How many guests will be attending?",
    "service type": "Which service would you like: Private Chef, Full-Service Catering, Drop-off Catering, or Cooking Class?",
    "type of event": "What type of event is this? For example: birthday, anniversary, family dinner, corporate event, graduation, or wedding.",
    "location": "In which city will the event take place?",
    "date": "What date is the event?",
    "time": "What time should the event start? Please include AM or PM.",
    "menu selections": "What dishes would you like? You can also say \"Chef Maria can decide.\"",
    "allergies or dietary restrictions": "Are there any allergies or dietary restrictions among the guests? You can say \"none\".",
    "name": "Could you please provide your name?",
    "email": "Could you please provide your email address?",
    "phone": "Could you please provide your phone number?"
  };

  return questions[missingField] || "Could you share the remaining details so I can finish your inquiry?";
}

// The place of the event in the customer's own words, for towns the parser does
// not already know. Only replies to a question about the city or location are used,
// and characters that could break the email to Chef Maria are removed.
function findTypedLocation(history, userMessage) {
  const turns = [...history, { role: "user", content: userMessage }];
  const asksForLocation =
    /(?:\bcity\b|\blocation\b|\bwhere\b)[^.!\n]*\?|(?:provide|share|tell|confirm|enter|give)[^.?!\n]*(?:\bcity\b|\blocation\b)/i;
  const isSummaryMessage =
    /summary|recap|details so far|details we have|what we have so far|we have so far|final summary|complete summary|confirm that everything|confirm if everything/i;

  let found = "";

  for (let i = 0; i < turns.length - 1; i++) {
    const assistant = turns[i];
    const user = turns[i + 1];

    if (assistant?.role !== "assistant" || user?.role !== "user") {
      continue;
    }

    const prompt = assistant.content || "";

    if (isSummaryMessage.test(prompt) || looksLikeFieldList(prompt) || !asksForLocation.test(prompt)) {
      continue;
    }

    const value = String(user.content || "")
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s,.'#\/-]/gu, "")
      .trim();

    const unusable =
      value.length < 3 ||
      value.length > 100 ||
      /@/.test(value) ||
      /^[\d\s().+\-\/,:]*$/.test(value) ||
      /\b(?:am|pm)\b/i.test(value) ||
      /^(?:yes|yeah|yep|no|nope|ok|okay|sure|thanks|thank you|correct|right|that's right|that is right)\b/i.test(value);

    if (!unusable) {
      found = value;
    }
  }

  return found;
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
   * CUISINE
   *
   * Use the newest positive cuisine choice.
   * Do not treat phrases such as "no Italian"
   * or "not Mexican" as cuisine selections.
   */
  const cuisinePattern =
    /\b(italian|mexic(?:an|am|ain|n)|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean)\b/gi;

  let cuisinePreference = "";

  const cuisineCandidates = [
    ...userMessages,
    userMessage
  ];

  for (let i = cuisineCandidates.length - 1; i >= 0; i--) {
    const candidate =
      cuisineCandidates[i] || "";

    const matches =
      [...candidate.matchAll(cuisinePattern)];

    for (let j = matches.length - 1; j >= 0; j--) {
      const match = matches[j];

      const prefix =
        candidate
          .slice(
            Math.max(0, match.index - 35),
            match.index
          )
          .toLowerCase();

      const negated =
        /\b(?:no|not|without)\s*$/.test(prefix) ||
        /\b(?:do not|don't|dont)\s+(?:want\s+)?$/.test(prefix);

      if (negated) {
        continue;
      }

      const rawCuisine =
        match[1].toLowerCase();

      if (/^mexic/.test(rawCuisine)) {
        cuisinePreference = "Mexican";
      } else {
        cuisinePreference =
          rawCuisine.charAt(0).toUpperCase() +
          rawCuisine.slice(1);
      }

      break;
    }

    if (cuisinePreference) {
      break;
    }
  }

  let specialCuisineReview =
    Boolean(
      cuisinePreference &&
      cuisinePreference !== "Italian"
    );


  /*
   * GUEST COUNT
   *
   * The newest guest count always wins.
   * Bare replies such as "9" are remembered when
   * they followed a guest-count question.
   */
  let guestCountValue = "";

  const guestConversation = [
    ...history,
    {
      role: "user",
      content: userMessage
    }
  ];

  for (let i = guestConversation.length - 1; i >= 0; i--) {
    const item =
      guestConversation[i];

    if (item?.role !== "user") {
      continue;
    }

    const candidate =
      (item.content || "").trim();

    const explicitMatches = [
      ...candidate.matchAll(
        /\b(\d{1,3})\s*(?:people|guests?|gusts?|persons?|adults?|children|kids)\b/gi
      )
    ];

    if (explicitMatches.length) {
      guestCountValue =
        explicitMatches[explicitMatches.length - 1][1];
      break;
    }

    const partyMatch =
      candidate.match(
        /\b(?:party|group|event|dinner)\s+(?:for|of)\s+(\d{1,3})\b/i
      );

    if (partyMatch) {
      guestCountValue =
        partyMatch[1];
      break;
    }

    const previous =
      guestConversation[i - 1];

    const previousAssistantAskedGuests =
      previous?.role === "assistant" &&
      /guest count|how many guests|number of guests|guests will be attending/i.test(
        previous.content || ""
      );

    if (previousAssistantAskedGuests) {
      const bareMatch =
        candidate.match(
          /^(?:actually\s+|change(?:\s+it)?\s+to\s+|make\s+it\s+)?(\d{1,3})$/i
        );

      if (bareMatch) {
        guestCountValue =
          bareMatch[1];
        break;
      }
    }
  }


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
   * EVENT TYPE / OCCASION
   */
  let eventType =
    findAnswerAfterPrompt(
      history,
      /type of event|what kind of event|occasion|what are you celebrating|event is this/i
    );

  /*
   * Do not accidentally save another booking field as the event type
   * when the customer answers the wrong question.
   */
  if (
    eventType &&
    /^(private chef|chef|catering|full[- ]?service catering|drop[- ]?off catering|cooking class|miami|miami beach|fort lauderdale|boca raton|palm beach|west palm beach|pompano beach|deerfield beach|delray beach|italian|mexican|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean|\d+|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|[\d\s().+-]{7,})$/i.test(
      eventType.trim()
    )
  ) {
    eventType = "";
  }

  const eventTypePattern =
    /\b(birthday(?: party)?|anniversary(?: dinner| party)?|family dinner|dinner party|corporate event|corporate dinner|business dinner|graduation(?: party)?|wedding(?: reception)?|rehearsal dinner|engagement(?: party)?|retirement(?: party)?|baby shower|bridal shower|holiday party|christmas party|thanksgiving dinner|baptism|communion|confirmation|memorial|celebration of life|fundraiser|cocktail party|private dinner)\b/i;

  if (!eventType) {
    const eventCandidates = [
      ...userMessages,
      userMessage
    ];

    for (let i = eventCandidates.length - 1; i >= 0; i--) {
      const match =
        (eventCandidates[i] || "").match(
          eventTypePattern
        );

      if (match) {
        eventType = match[1];
        break;
      }
    }
  }

  if (eventType) {
    eventType =
      eventType
        .replace(/^(?:this is|it is|it's|its)\s+/i, "")
        .trim()
        .replace(/\s+/g, " ");

    eventType =
      eventType.charAt(0).toUpperCase() +
      eventType.slice(1);
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

  // Any other town counts too. Chef Maria reads it exactly as the customer typed it.
  if (!cityLocation) {
    cityLocation = findTypedLocation(history, userMessage);
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

  // If the customer answered several questions in one message, keep only the part about the
  // menu. Anything from the first allergy, email, phone or "no" answer onward is dropped.
  if (/@|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|allerg/i.test(menuPreference)) {
    const keptParts = [];

    for (const part of menuPreference.split(/[,;]+/)) {
      if (/@|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|allerg|^\s*(?:no|none|nope)\b/i.test(part)) {
        break;
      }

      keptParts.push(part.trim());
    }

    menuPreference = keptParts.join(", ");
  }

  const approvedDishMatchers = [
    ["Bruschetta al Pomodoro", /\bbruschetta(?: al pomodoro)?\b/i],
    ["Caprese Salad", /\bcaprese(?: salad)?\b(?! kabobs?)/i],
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
    ["Mixed Berries with Zabaione", /\bmixed berries with zabaione\b/i],

    // Added from Chef Maria's current menu.
    ["Mini Pizzas", /\bmini pizzas?\b/i],
    ["Polenta with Brie and Mushrooms", /\bpolenta with brie\b/i],
    ["Seafood Salad", /\bseafood salad\b/i],
    ["Caprese Kabobs", /\bcaprese kabobs?\b/i],
    ["Spaghetti Marinara", /\bspaghetti marinara\b/i],
    ["Spaghetti Carbonara", /\bspaghetti carbonara\b/i],
    ["Squash Gnocchi", /\bsquash gnocchi\b/i],
    ["Tagliatelle al Pesto", /\btagliatelle al pesto\b/i],
    ["Rigatoni Brie with Mushrooms & Walnuts", /\brigatoni brie\b/i],
    ["Creamy Rigatoni with Speck & Zucchini", /\bcreamy rigatoni\b/i],
    ["Risotto con Radicchio e Amarone", /\brisotto con radicchio\b/i],
    ["Veal Saltimbocca", /\bveal saltimbocca\b/i],
    ["Ossobuco", /\b(?:ossobuco|osso buco)\b/i],
    ["Broiled Lamb Chops", /\b(?:broiled )?lamb chops\b/i],
    ["Marinated Trout", /\bmarinated trout\b/i],
    ["Baked Snapper Mediterraneo", /\bbaked snapper\b/i],
    ["Whole Fish in Cartoccio", /\bwhole fish in cartoccio\b/i],
    ["Branzino Oreganato", /\bbranzino oreganato\b/i],
    ["Mixed Salad", /\bmixed salad\b/i],
    ["Fennel Gratiné", /\bfennel gratin(?:é|e)?\b/i],
    ["Cold Hazelnut Cake", /\bcold hazelnut cake\b/i],
    ["Puff Pastry Apple Wheels", /\bpuff pastry apple wheels\b/i],
    ["Fruit Tart or Marmalade Tart", /\b(?:fruit|marmalade) tart\b/i],
    ["Strudel di Mele", /\bstrudel(?: di mele)?\b/i],
    ["Nutella Pockets", /\bnutella pockets?\b/i],
    ["Affogato al Caffè", /\baffogato(?: al caff(?:e|è))?\b/i],
    ["Gelato with Warm Berries", /\bgelato with warm berries\b/i],
    ["Linguine al Pesto", /\blinguine al pesto\b/i],
    ["Bucatini Amatriciana", /\bbucatini(?: amatriciana)?\b/i],
    ["Linguine with Seafood", /\b(?:linguine with seafood|seafood linguine)\b/i],
    ["Linguine with Clam Sauce", /\b(?:linguine with clam sauce|clam sauce linguine)\b/i],
    ["Seafood Risotto", /\bseafood risotto\b/i],
    ["Veal Milanese", /\bveal milanese\b/i],
    ["Veal Piccata", /\bveal piccata\b/i],
    ["Lava Cake with Gelato", /\blava cake\b/i],
    ["Amaretto Ice Cream", /\bamaretto ice cream\b/i]
  ];

  const customerSelectedDishes =
    approvedDishMatchers
      .filter(([, pattern]) => pattern.test(allUserText))
      .map(([dish]) => dish);

  /*
   * If the customer ultimately chooses several dishes
   * from Chef Maria's approved Italian menu, treat that
   * as a clear switch to Italian cuisine.
   */
  if (customerSelectedDishes.length >= 2) {
    cuisinePreference = "Italian";
    specialCuisineReview = false;
  }

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
    !/^(?:no\s+|not\s+|without\s+)?(?:italian|mexic(?:an|am|ain|n)|mediterranean|american|french|spanish|greek|japanese|thai|indian|chinese|caribbean)$/i.test(
      specialCuisineFoodAnswer.trim()
    ) &&
    !/^(you choose|you decide|chef maria can decide|chef maria may decide|choose for me|surprise me|whatever chef maria recommends|all of them|everything|ok|okay|yes|great|sounds good)$/i.test(
      specialCuisineFoodAnswer.trim()
    );

  if (customerSelectedDishes.length > 0) {
    menuPreference =
      customerSelectedDishes.join(", ");
  } else if (
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


  // For an Italian menu, "you choose" is a real answer. Without this, the reply to the
  // NEXT question (for example "none" for allergies) could be saved as the menu.
  const menuLooksEmpty =
    !menuPreference.trim() ||
    /^(none|no|nope|nothing|n\/a|na|yes|yeah|yep|ok|okay|you choose|you decide|chef maria can decide|chef maria may decide|choose for me|surprise me|whatever chef maria recommends)[.!\s]*$/i.test(menuPreference.trim());

  if (
    !specialCuisineReview &&
    customerDelegatedSpecialMenu &&
    !customerSelectedDishes.length &&
    !assistantSelectedDishes.length &&
    menuLooksEmpty
  ) {
    menuPreference = "Customer asked Chef Maria to choose the menu.";
  }


  /*
   * ALLERGIES / DIETARY RESTRICTIONS
   *
   * Remember dietary information even if the customer mentions it
   * earlier in the conversation.
   */
  let allergies =
    findAnswerAfterPrompt(
      history,
      /allergies|dietary restrictions|dietary needs|dietary preferences/i
    );

  if (
    /^(no+|nope+|none|nah|npo|no allergies|no allergy|no restrictions|no dietary restrictions|no dietary needs)$/i.test(
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
  } else if (
    // A phone number, a date or an email can never be an allergy answer.
    /^[\d\s().+-]{7,}$/.test(allergies.trim()) ||
    /@/.test(allergies)
  ) {
    allergies = "";
  }

  const dietaryCandidates = [
    ...userMessages,
    userMessage
  ];

  let dietaryDetails = [];
  let dietaryExplicitNone = false;

  const addDietaryDetail = (value) => {
    if (
      value &&
      !dietaryDetails.some(
        (item) =>
          item.toLowerCase() === value.toLowerCase()
      )
    ) {
      dietaryDetails.push(value);
    }
  };

  for (const candidateRaw of dietaryCandidates) {
    const candidate =
      (candidateRaw || "").trim();

    if (!candidate) {
      continue;
    }

    /*
     * Never record pet dietary information.
     */
    const isPetDietary =
      /\b(dog|cat|pet|puppy|kitten|animal)\b/i.test(
        candidate
      ) &&
      /\b(gluten|glutten|allerg|diet|dietary|dairy|peanut|nut|shellfish|food|meal)\b/i.test(
        candidate
      );

    if (isPetDietary) {
      continue;
    }

    /*
     * A later explicit "none" clears older dietary information.
     */
    const explicitNone =
      /^(?:actually\s+)?(?:no+|none|nope|nah)\s*(?:allergies?|dietary restrictions?|dietary needs?|dietary preferences?|restrictions?)?[.!]?$/i.test(
        candidate
      ) ||
      /\b(?:actually\s+)?no\s+(?:allergies?|dietary restrictions?|dietary needs?|dietary preferences?)\b/i.test(
        candidate
      );

    if (explicitNone) {
      dietaryDetails = [];
      dietaryExplicitNone = true;
      continue;
    }

    const foundBefore =
      dietaryDetails.length;

    if (
      /\b(?:gluten|glutten)\s*-?\s*g?free+\b/i.test(candidate)
    ) {
      addDietaryDetail("Gluten-free");
    }

    if (/\bceliac\b/i.test(candidate)) {
      addDietaryDetail("Celiac");
    }

    if (/\bdairy[- ]?free\b/i.test(candidate)) {
      addDietaryDetail("Dairy-free");
    }

    if (/\blactose intolerant\b/i.test(candidate)) {
      addDietaryDetail("Lactose intolerant");
    }

    if (/\bvegetarian\b/i.test(candidate)) {
      addDietaryDetail("Vegetarian");
    }

    if (/\bvegan\b/i.test(candidate)) {
      addDietaryDetail("Vegan");
    }

    if (/\bpescatarian\b/i.test(candidate)) {
      addDietaryDetail("Pescatarian");
    }

    if (/\bpeanut allerg(?:y|ic)\b/i.test(candidate)) {
      addDietaryDetail("Peanut allergy");
    }

    if (/\btree nut allerg(?:y|ic)\b/i.test(candidate)) {
      addDietaryDetail("Tree nut allergy");
    }

    if (
      /\bnut allerg(?:y|ic)\b/i.test(candidate) &&
      !/\b(?:peanut|tree nut) allerg/i.test(candidate)
    ) {
      addDietaryDetail("Nut allergy");
    }

    if (/\bshellfish allerg(?:y|ic)\b/i.test(candidate)) {
      addDietaryDetail("Shellfish allergy");
    }

    if (/\bseafood allerg(?:y|ic)\b/i.test(candidate)) {
      addDietaryDetail("Seafood allergy");
    }

    if (/\begg allerg(?:y|ic)\b/i.test(candidate)) {
      addDietaryDetail("Egg allergy");
    }

    if (/\bsoy allerg(?:y|ic)\b/i.test(candidate)) {
      addDietaryDetail("Soy allergy");
    }

    if (/\bkosher\b/i.test(candidate)) {
      addDietaryDetail("Kosher");
    }

    if (/\bhalal\b/i.test(candidate)) {
      addDietaryDetail("Halal");
    }

    if (/\bno pork\b/i.test(candidate)) {
      addDietaryDetail("No pork");
    }

    if (/\blow[- ]?sodium\b/i.test(candidate)) {
      addDietaryDetail("Low sodium");
    }

    /*
     * Capture less common allergies such as:
     * "allergic to sesame"
     */
    if (dietaryDetails.length === foundBefore) {
      const allergicToMatch =
        candidate.match(
          /\ballergic to\s+([^,.;\n]{1,60})/i
        );

      if (allergicToMatch) {
        const allergen =
          allergicToMatch[1].trim();

        const obviouslyNotFood =
          /^(?:people|person|persons|humans?|men|women|boys|girls|kids|children|adults|guests?|customers?|clients?|chefs?|servers?|waiters?|waitresses?|politics|work|working|mondays?)$/i.test(
            allergen
          );

        if (!obviouslyNotFood) {
          addDietaryDetail(
            `Allergic to ${allergen}`
          );
        }
      }
    }

    if (dietaryDetails.length > foundBefore) {
      dietaryExplicitNone = false;
    }
  }

  if (dietaryDetails.length > 0) {
    allergies =
      dietaryDetails.join(", ");
  } else if (dietaryExplicitNone) {
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
      /provide.*name|your name\?|may i have your name|what is your name/i
    );

  // findAnswerAfterPrompt only sees earlier turns. When the bot's last message asked for
  // the name, the message being answered now IS the name, and the newest answer wins.
  const lastAssistantForName =
    [...history].reverse().find((item) => item.role === "assistant")?.content || "";

  // The bot is waiting for the name when its last request is about the name, or when no valid
  // name has been recorded yet and its last message mentions one ("...I still need your name.
  // Could you please provide it?").
  const nameNotValidYet = !isPlainName(name);

  if (
    !looksLikeFieldList(lastAssistantForName) &&
    (/\bname\b/i.test(lastRequestSentence(lastAssistantForName)) ||
      (nameNotValidYet && /\bname\b/i.test(lastAssistantForName)))
  ) {
    const typedName = String(userMessage || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:my name is|it is|it's|this is|i am|i'm)\s+/i, "");

    if (isPlainName(typedName)) {
      name = typedName;
    }
  }

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

  // Something that is not a plain name ("guests are 9", an email, a phone number) is not saved as the name.
  if (name && !isPlainName(name)) {
    name = "";
  }


  /*
   * EMAIL
   */
  /*
   * EMAIL
   *
   * The newest valid email wins.
   */
  let emailMatch = null;

  const emailCandidates = [
    ...userMessages,
    userMessage
  ];

  for (let i = emailCandidates.length - 1; i >= 0; i--) {
    const match =
      (emailCandidates[i] || "").match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
      );

    if (match) {
      emailMatch = match;
      break;
    }
  }


  /*
   * PHONE
   */
  /*
   * PHONE
   *
   * The newest valid U.S. phone number wins.
   */
  let phoneMatch = null;

  const phoneCandidates = [
    ...userMessages,
    userMessage
  ];

  for (let i = phoneCandidates.length - 1; i >= 0; i--) {
    const candidate =
      phoneCandidates[i] || "";

    const match =
      candidate.match(
        /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/
      );

    if (!match) {
      continue;
    }

    const area = match[1];
    const exchange = match[2];
    const digits =
      `${area}${exchange}${match[3]}`;

    const valid =
      /^[2-9]\d{2}$/.test(area) &&
      /^[2-9]\d{2}$/.test(exchange) &&
      !/^(\d)\1{9}$/.test(digits);

    if (valid) {
      phoneMatch = match;
      break;
    }
  }


  const info = {
    guests:
      guestCountValue,

    serviceType,

    eventType,

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
      info.eventType &&
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
    <p><strong>Type of event:</strong> ${bookingInfo.eventType || "Not provided"}</p>
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
