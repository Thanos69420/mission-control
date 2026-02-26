import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { chromium } from 'playwright';
import { existsSync, realpathSync } from 'fs';
import path from 'path';

function expandHome(p: string): string {
  return p.replace(/^~/, process.env.HOME || '');
}

function getAllowedRoots(): string[] {
  const workspaceBase = (process.env.WORKSPACE_BASE_PATH || '~/Documents/Shared').replace(/^~/, process.env.HOME || '');
  const projectsBase = (process.env.PROJECTS_PATH || '~/Documents/Shared/projects').replace(/^~/, process.env.HOME || '');
  return [workspaceBase, projectsBase];
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; deliverableId: string } }
) {
  const db = getDb();
  const { id: taskId, deliverableId } = params;

  const deliverable = db.prepare(`
    SELECT * FROM task_deliverables
    WHERE id = ? AND task_id = ?
  `).get(deliverableId, taskId) as
    | { id: string; task_id: string; title: string; path: string | null; deliverable_type: string }
    | undefined;

  if (!deliverable) {
    return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 });
  }

  if (!deliverable.path || deliverable.deliverable_type !== 'file') {
    return NextResponse.json({ error: 'Deliverable is not a file path' }, { status: 400 });
  }

  if (!/\.html?$/i.test(deliverable.path)) {
    return NextResponse.json({ error: 'PDF generation currently supports HTML deliverables only' }, { status: 400 });
  }

  const sourcePath = path.normalize(expandHome(deliverable.path));
  if (!existsSync(sourcePath)) {
    return NextResponse.json({ error: 'Source file not found' }, { status: 404 });
  }

  let resolvedSource: string;
  try {
    resolvedSource = realpathSync(sourcePath);
  } catch {
    return NextResponse.json({ error: 'Unable to resolve source file path' }, { status: 400 });
  }

  const allowedRoots = getAllowedRoots().filter(existsSync).map((root) => realpathSync(root));
  const allowed = allowedRoots.some((root) => resolvedSource === root || resolvedSource.startsWith(root + path.sep));
  if (!allowed) {
    return NextResponse.json({ error: 'Source path is outside allowed directories' }, { status: 403 });
  }

  const pdfPath = sourcePath.replace(/\.html?$/i, '.pdf');

  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file://${resolvedSource}`, { waitUntil: 'networkidle' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();

    // Insert deliverable if not already present
    const existingPdf = db.prepare(`
      SELECT * FROM task_deliverables
      WHERE task_id = ? AND deliverable_type = 'file' AND path = ?
      LIMIT 1
    `).get(taskId, pdfPath) as { id: string } | undefined;

    let createdDeliverable: unknown = existingPdf;
    if (!existingPdf) {
      const newId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description)
        VALUES (?, ?, 'file', ?, ?, ?)
      `).run(
        newId,
        taskId,
        `${deliverable.title.replace(/\.html?$/i, '')}.pdf`,
        pdfPath,
        'Generated from HTML deliverable'
      );

      createdDeliverable = db.prepare(`SELECT * FROM task_deliverables WHERE id = ?`).get(newId);

      broadcast({
        type: 'deliverable_added',
        payload: createdDeliverable,
      });
    }

    return NextResponse.json({
      success: true,
      pdfPath,
      deliverable: createdDeliverable,
    });
  } catch (error) {
    console.error('PDF generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
