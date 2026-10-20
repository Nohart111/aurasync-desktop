import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

export async function GET() {
  if (GITHUB_TOKEN) {
    try {
      const ghRes = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/data/catalog.json?t=${Date.now()}`,
        {
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3.raw',
          },
          next: { revalidate: 10 },
        }
      );
      if (ghRes.ok) {
        const data = await ghRes.json();
        if (Array.isArray(data) && data.length > 0) {
          return NextResponse.json(data);
        }
      }
    } catch {}
  }

  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json([]);
  }
}
