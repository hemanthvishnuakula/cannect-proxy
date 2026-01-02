#!/bin/bash
curl -s "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Authorization: Bearer AIzaSyCNK825E5y3OAr63vH3p0HiQ4bb0NWnwyQ" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash-lite","messages":[{"role":"user","content":"Say hello"}]}'
