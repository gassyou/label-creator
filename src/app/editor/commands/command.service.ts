import { Injectable, signal } from '@angular/core';
import { LabelElement } from './models/editor.models';

/**
 * Command Interface - Section 35
 * All operations go through Command pattern for Undo/Redo support
 */
export interface Command {
  id: string;
  name: string;
  execute(): void;
  undo(): void;
  redo(): void;
}

/**
 * Command History Manager
 * Maintains stack of executed commands for undo/redo
 */
@Injectable()
export class CommandService {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistorySize = 50;

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly lastAction = signal<string | null>(null);

  /**
   * Execute a command and add it to history
   */
  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack on new action

    // Limit history size
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }

    this.updateState();
  }

  /**
   * Undo the last command
   */
  undo(): void {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      this.updateState();
    }
  }

  /**
   * Redo the last undone command
   */
  redo(): void {
    const command = this.redoStack.pop();
    if (command) {
      command.redo();
      this.undoStack.push(command);
      this.updateState();
    }
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.updateState();
  }

  private updateState(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.lastAction.set(this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].name : null);
  }
}

/**
 * Element Command Factory
 * Creates commands for element operations
 */
@Injectable()
export class ElementCommandFactory {
  constructor(private commandService: CommandService) {}

  /**
   * Create and execute an add element command
   */
  addElement(element: LabelElement, target: { add: (el: LabelElement) => void }): void {
    const command: Command = {
      id: `cmd-add-${Date.now()}`,
      name: `Add ${element.type}`,
      execute: () => target.add(element),
      undo: () => {/* Remove logic handled by caller */},
      redo: () => target.add(element)
    };
    this.commandService.execute(command);
  }

  /**
   * Create and execute a remove element command
   */
  removeElement(element: LabelElement, target: { add: (el: LabelElement) => void; remove: (el: LabelElement) => void }): void {
    const command: Command = {
      id: `cmd-remove-${Date.now()}`,
      name: `Remove ${element.type}`,
      execute: () => target.remove(element),
      undo: () => target.add(element),
      redo: () => target.remove(element)
    };
    this.commandService.execute(command);
  }

  /**
   * Create and execute a move element command
   */
  moveElement(
    element: LabelElement,
    oldX: number,
    oldY: number,
    newX: number,
    newY: number,
    updater: (el: LabelElement, x: number, y: number) => void
  ): void {
    const command: Command = {
      id: `cmd-move-${Date.now()}`,
      name: `Move ${element.type}`,
      execute: () => updater(element, newX, newY),
      undo: () => updater(element, oldX, oldY),
      redo: () => updater(element, newX, newY)
    };
    this.commandService.execute(command);
  }

  /**
   * Create and execute a resize element command
   */
  resizeElement(
    element: LabelElement,
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
    updater: (el: LabelElement, w: number, h: number) => void
  ): void {
    const command: Command = {
      id: `cmd-resize-${Date.now()}`,
      name: `Resize ${element.type}`,
      execute: () => updater(element, newWidth, newHeight),
      undo: () => updater(element, oldWidth, oldHeight),
      redo: () => updater(element, newWidth, newHeight)
    };
    this.commandService.execute(command);
  }

  /**
   * Create and execute a property change command
   */
  changeProperty<T>(
    element: LabelElement,
    property: keyof LabelElement,
    oldValue: T,
    newValue: T,
    updater: (el: LabelElement, prop: keyof LabelElement, value: T) => void
  ): void {
    const command: Command = {
      id: `cmd-change-${Date.now()}`,
      name: `Change ${String(property)}`,
      execute: () => updater(element, property, newValue),
      undo: () => updater(element, property, oldValue),
      redo: () => updater(element, property, newValue)
    };
    this.commandService.execute(command);
  }
}