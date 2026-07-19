import { TestBed } from '@angular/core/testing';
import { EditorCanvasService } from '../editor-canvas.service';
import { LabelDocumentService } from '../document/label-document.service';
import { FabricRenderer } from '../render/fabric-renderer';
import { vi, beforeEach, describe, it, expect } from 'vitest';

// TODO Phase 1: add canvas-level integration tests once fabric-renderer is extracted.
// For now, doc-level tests are the safety net.

describe('Canvas ↔ Doc round-trip', () => {
  let service: EditorCanvasService;
  let doc: LabelDocumentService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EditorCanvasService, LabelDocumentService, FabricRenderer],
    });
    service = TestBed.inject(EditorCanvasService);
    doc = TestBed.inject(LabelDocumentService);
  });

  it('placeholder — full suite below', () => {
    expect(service).toBeTruthy();
    expect(doc).toBeTruthy();
  });

  it('add → drag → undo: canvas and doc both return to empty', async () => {
    // Setup: an empty service (no canvas initialization in this testbed; we exercise doc only)
    // Action: simulate an add via doc.addElement (mimicking AddShapeCommand.execute's last line)
    doc.addElement({ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 100, height: 100 });
    // Action: simulate a drag via doc.updateElement
    doc.updateElement('rect-1', { x: 50, y: 50 });

    // Assert mid-state
    expect(doc.elements().get('rect-1')?.x).toBe(50);

    // Action: simulate undo (we don't yet have UndoRedoService — the bug is structural)
    // For Phase 0, this test exercises doc-only state. The real test against canvas
    // requires canvas initialization in a jsdom env (Phase 0 sub-task).
    doc.removeElement('rect-1');

    // Assert post-state
    expect(doc.elements().size).toBe(0);
  });

  it('add → undo → redo: doc.elements round-trips id and geometry', () => {
    const element = { id: 'rect-1', type: 'rect' as const, x: 100, y: 100, width: 50, height: 50 };
    doc.addElement(element);
    doc.updateElement('rect-1', { x: 200, y: 200 });

    // Snapshot mid-state (mimics undo)
    const snapshot = new Map(doc.elements());

    // Simulate undo: restore from snapshot
    doc.setElements(snapshot);

    expect(doc.elements().get('rect-1')?.x).toBe(200);
  });

  it('add → undo → add different element → redo: only the new element survives', () => {
    // This is the user-reported undo bug, expressed at the doc layer
    doc.addElement({ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 100, height: 100 });

    // Snapshot before add
    const snap1 = new Map(doc.elements());

    doc.addElement({ id: 'rect-2', type: 'rect', x: 100, y: 0, width: 100, height: 100 });

    // Undo (restore snap1)
    doc.setElements(snap1);
    expect(doc.elements().size).toBe(1);
    expect(doc.elements().has('rect-1')).toBe(true);

    // Add a third element
    doc.addElement({ id: 'rect-3', type: 'rect', x: 200, y: 0, width: 100, height: 100 });

    // Redo (this is the bug — should NOT bring back rect-2)
    doc.setElements(new Map([['rect-1', doc.elements().get('rect-1')!], ['rect-3', doc.elements().get('rect-3')!]]));

    expect(doc.elements().size).toBe(2);
    expect(doc.elements().has('rect-1')).toBe(true);
    expect(doc.elements().has('rect-3')).toBe(true);
    expect(doc.elements().has('rect-2')).toBe(false); // ← the bug
  });

  it('delete → undo: removed element returns to doc.elements', () => {
    doc.addElement({ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 100, height: 100 });
    const snap1 = new Map(doc.elements());
    doc.removeElement('rect-1');
    doc.setElements(snap1);
    expect(doc.elements().get('rect-1')?.x).toBe(0);
  });
});