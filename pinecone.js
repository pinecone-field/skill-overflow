import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

function getIndex() {
  return pc.index(process.env.PINECONE_INDEX);
}

export async function embedText(text, inputType = 'passage') {
  const result = await pc.inference.embed({
    model: 'llama-text-embed-v2',
    inputs: [text],
    parameters: { inputType, truncate: 'END' },
  });
  return result.data[0].values;
}

export async function queryIndex(vector, topK = 10) {
  const index = getIndex();
  const result = await index.query({
    vector,
    topK,
    includeMetadata: true,
    includeValues: true,
  });
  return result.matches ?? [];
}

export async function upsertVector(id, values, metadata) {
  const index = getIndex();
  await index.upsert([{ id, values, metadata }]);
}

export async function fetchVector(id) {
  const index = getIndex();
  const result = await index.fetch([id]);
  return result.records[id] ?? null;
}
