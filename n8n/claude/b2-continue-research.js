// n8n Code node: "Continue research"   Mode: Run Once for Each Item
// Runs only when "Claude: research" stopped with stop_reason = "pause_turn"
// (the web search took many steps). Sends the conversation back so Claude can
// finish. Output -> "Claude: research (resume)" HTTP node (same settings).
const first = $('Build research request').item.json.claude_body;
return {
  json: {
    claude_body: {
      ...first,
      messages: [...first.messages, { role: 'assistant', content: $input.item.json.content }],
    },
  },
};
