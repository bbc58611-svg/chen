# Momo — Your Little Wish Companion

## Elevator pitch

An animated AI companion that turns a wish into practical options, helps users refine their choices, and offers a PayPal Sandbox checkout they explicitly approve.

## Inspiration

People often start with a goal rather than a product: “I want to feel more confident speaking English,” or “I want to find a thoughtful gift for a friend.” A search box expects keywords, while checkout expects an item. The conversation between those points can be difficult: understanding the goal, deciding what matters, and finding a manageable next step.

Momo makes that process feel more approachable. It is a small animated companion that listens, explores possibilities, and leaves the final choice with the user.

## What it does

A user describes a goal in ordinary language. Momo extracts needs such as budget, timing, group size, location, and preferences, then proposes a way forward. Users can edit those needs, add feedback, or select next steps rather than repeatedly rewriting a long prompt.

When outside information is needed, Momo searches the web and presents resources linked to their original sources. Reference prices, names, and locations are checked against returned source material. Missing evidence stays unconfirmed. Follow-up actions can become selectable questions, checklists, or editable contact messages.

The companion changes visual state as the interaction progresses, giving waiting and decision-making a friendly, understandable rhythm.

A clearly labeled fictional catalog of language-practice sessions and lightweight gifts demonstrates the payment journey. Users can ask AI to find an eligible test option, review the amount, approve a PayPal Sandbox payment, and inspect a verified receipt.

Real web resources and fictional test items are distinguished throughout. Momo does not collect payments for external search results or claim to have booked a real provider.

## Who it is for

The prototype is for people who have an everyday goal but are unsure how to turn it into a useful search or next action. Initial examples focus on language practice, thoughtful gifts, and approachable service discovery.

The intended value is reducing the effort between describing an intention and making an informed choice. That is the design goal illustrated by the prototype; no conversion gains or real customer outcomes have been measured.

## How it was built

The frontend uses HTML, CSS, JavaScript, and an inline SVG character. A small Node.js backend serves the application, validates requests, and connects to DeepSeek and PayPal. There are no third-party npm runtime dependencies or build step.

**DeepSeek Chat** interprets intent, produces structured needs and actions, and turns selected questions into useful messages. **DeepSeek Search** retrieves sources when outside information is needed. Server validation binds cards to actual search results and checks evidence for reference-price claims.

**PayPal Sandbox** supplies payment approval and capture. The backend owns test-catalog prices, creates orders, retrieves official approval links, and verifies the resulting order and capture. AI does not set authoritative payable amounts or approve payments. Order identity, currency, amount, and completed capture must match before success is recorded.

The test catalog demonstrates the handoff from an AI-assisted decision to a payment the user consciously approves. It is a proof of the interaction, not a claim of a functioning marketplace or fulfillment network.

## Challenges addressed

**Open-ended recommendations without invented merchants.** A preset catalog cannot cover every wish. Live search and source-linked cards extend discovery, while missing information remains visible instead of being replaced with fictional providers.

**Easier refinement.** Long explanations and repeated checklists made the flow cumbersome. Editable need summaries, selection submission, and editable message drafts help users make smaller, clearer decisions.

**Uncertain payment outcomes.** Returning from a payment page does not prove success. Persisted idempotency keys, explicit buyer approval, and capture verification distinguish retries, cancellations, and uncertain responses.

**A playful interface with clear boundaries.** The character makes exploration approachable. Source links, test labels, and the review step keep information and payment decisions understandable.

## Progress and accomplishments

- A local flow from an AI-interpreted wish to a reviewed, buyer-approved Sandbox payment.
- Discovery using real sources beyond a fixed catalog.
- Source checks and deterministic catalog constraints that reduce unsupported recommendations.
- A friendly animated interface with editable needs and selection-based next steps.
- Automated coverage for source evidence, request boundaries, budget and timing constraints, selection, payment integrity, and restart reconciliation.

## Lessons learned

A useful assistant needs more than a confident answer. Users need to revise it, inspect supporting information, and understand the next action. Separating information discovery from an authorized transaction helped make both clearer.

Payment reliability belongs in server-side state and verification. A polished success screen must reflect a verified provider result, especially when a request is delayed or repeated.

## What's next

- Evaluate the flow with users and narrow the first real service category around observed needs.
- Explore provider onboarding, confirmed availability, and supported booking integrations before enabling real transactions.
- Add durable multi-user storage and operational controls before a broader hosted release.
- Improve comparison quality without overwhelming users.
- Extend companion feedback and accessibility across desktop and mobile layouts.

These are planned directions, not implemented features.

## Built with

JavaScript, HTML, CSS, SVG, Node.js, DeepSeek Chat API, DeepSeek Search API, PayPal JavaScript SDK, PayPal Sandbox Orders API, and the Node.js test runner.

## Testing and access

The complete source runs locally on Node.js 22 or later. See the README for quick start and `docs/JUDGING.md` for live access. The preset interface and mocked tests require no API credentials. Live AI, search, and payment require privately supplied test access, to be arranged before submission. No production key or private order data is included in the public source.
