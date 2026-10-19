import fs from "fs/promises";
import path from "path";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";

const catalogPath = path.join(process.cwd(), "data", "catalog.json");

async function ensureCatalog(): Promise<void> {
  const dir = path.dirname(catalogPath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(catalogPath);
  } catch {
    await fs.writeFile(catalogPath, JSON.stringify([], null, 2), "utf-8");
  }
}

export async function getCatalog(): Promise<Track[]> {
  await ensureCatalog();
  const raw = await fs.readFile(catalogPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveTrackToCatalog(track: Track): Promise<void> {
  const list = await getCatalog();
  list.unshift(track);
  await fs.writeFile(catalogPath, JSON.stringify(list, null, 2), "utf-8");
}