import { Injectable } from '@angular/core';

/**
 * BindingResolver - Section 16-20
 * Resolves template expressions like ${name}, ${price * qty}, ${upper(name)}
 */

@Injectable()
export class BindingResolverService {
  private readonly EXPRESSION_PATTERN = /\$\{(.*?)\}/g;
  private readonly functions: Map<string, Function> = new Map();

  constructor() {
    this.registerDefaultFunctions();
  }

  /**
   * Resolve a template string with business data
   * Section 19 - Example implementation
   */
  resolveTemplate(template: string, data: Record<string, any>): string {
    return template.replace(this.EXPRESSION_PATTERN, (_, expression) => {
      const trimmed = expression.trim();
      return this.resolveExpression(trimmed, data);
    });
  }

  /**
   * Resolve a single expression
   */
  resolveExpression(expression: string, data: Record<string, any>): string {
    const functionMatch = expression.match(/^(\w+)\((.*)\)$/);
    if (functionMatch) {
      const [, funcName, args] = functionMatch;
      return this.executeFunction(funcName, args, data);
    }

    if (!expression.includes(' ') && !expression.includes('*') && !expression.includes('/') && !expression.includes('+') && !expression.includes('-')) {
      return this.getVariableValue(expression, data);
    }

    if (expression.includes('*') || expression.includes('/') || expression.includes('+') || expression.includes('-')) {
      return this.evaluateExpression(expression, data);
    }

    return '';
  }

  private getVariableValue(key: string, data: Record<string, any>): string {
    const value = data[key.trim()];
    return value !== undefined ? String(value) : '';
  }

  private evaluateExpression(expression: string, data: Record<string, any>): string {
    try {
      const varPattern = /[a-zA-Z_]\w*/g;
      const variables = expression.match(varPattern) || [];

      const context: Record<string, any> = {};
      for (const v of variables) {
        if (data[v] !== undefined) {
          context[v] = data[v];
        }
      }

      let evalExpression = expression;
      for (const [key, value] of Object.entries(context)) {
        evalExpression = evalExpression.replace(new RegExp('\\b' + key + '\\b', 'g'), String(value));
      }

      if (/^[\d\s+\-*/().]+$/.test(evalExpression)) {
        const result = Function('"use strict"; return (' + evalExpression + ')')();
        return String(result);
      }

      return expression;
    } catch {
      return expression;
    }
  }

  private executeFunction(funcName: string, argsStr: string, data: Record<string, any>): string {
    const func = this.functions.get(funcName.toLowerCase());
    if (!func) {
      return '${' + funcName + '(' + argsStr + ')}';
    }

    const args = argsStr.split(',').map((arg) => {
      const trimmed = arg.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
      }
      return this.getVariableValue(trimmed, data);
    });

    try {
      return String(func.apply(null, args));
    } catch {
      return '${' + funcName + '(' + argsStr + ')}';
    }
  }

  registerFunction(name: string, func: Function): void {
    this.functions.set(name.toLowerCase(), func);
  }

  private registerDefaultFunctions(): void {
    this.functions.set('upper', (str: string) => String(str).toUpperCase());
    this.functions.set('lower', (str: string) => String(str).toLowerCase());
    this.functions.set('trim', (str: string) => String(str).trim());
    this.functions.set('capitalize', (str: string) => {
      const s = String(str);
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    });

    this.functions.set('currency', (num: number, symbol: string = '$') => {
      const n = Number(num);
      if (isNaN(n)) {
        return String(num);
      }
      return symbol + n.toFixed(2);
    });

    this.functions.set('round', (num: number, decimals: number = 0) => {
      const n = Number(num);
      const factor = Math.pow(10, decimals);
      return String(Math.round(n * factor) / factor);
    });

    this.functions.set('date', (date: string | Date, format: string = 'YYYY-MM-DD') => {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return String(date);

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');

      return format
        .replace('YYYY', String(year))
        .replace('MM', month)
        .replace('DD', day);
    });

    this.functions.set('barcode', (value: string) => value);
    this.functions.set('qrcode', (value: string) => value);
  }
}