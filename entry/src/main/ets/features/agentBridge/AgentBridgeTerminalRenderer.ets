export class AgentBridgeTerminalColor {
  static readonly DEFAULT: string = 'default';
  static readonly BLACK: string = 'black';
  static readonly RED: string = 'red';
  static readonly GREEN: string = 'green';
  static readonly YELLOW: string = 'yellow';
  static readonly BLUE: string = 'blue';
  static readonly MAGENTA: string = 'magenta';
  static readonly CYAN: string = 'cyan';
  static readonly WHITE: string = 'white';
}

export class AgentBridgeTerminalStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  foreground: string;
  background: string;

  constructor(
    bold: boolean = false,
    italic: boolean = false,
    underline: boolean = false,
    inverse: boolean = false,
    foreground: string = AgentBridgeTerminalColor.DEFAULT,
    background: string = AgentBridgeTerminalColor.DEFAULT
  ) {
    this.bold = bold;
    this.italic = italic;
    this.underline = underline;
    this.inverse = inverse;
    this.foreground = foreground;
    this.background = background;
  }

  copy(): AgentBridgeTerminalStyle {
    return new AgentBridgeTerminalStyle(
      this.bold,
      this.italic,
      this.underline,
      this.inverse,
      this.foreground,
      this.background
    );
  }

  matches(other: AgentBridgeTerminalStyle): boolean {
    return this.bold === other.bold &&
      this.italic === other.italic &&
      this.underline === other.underline &&
      this.inverse === other.inverse &&
      this.foreground === other.foreground &&
      this.background === other.background;
  }
}

export class AgentBridgeTerminalRenderRun {
  id: string;
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  foreground: string;
  background: string;

  constructor(id: string, text: string, style: AgentBridgeTerminalStyle) {
    this.id = id;
    this.text = text;
    this.bold = style.bold;
    this.italic = style.italic;
    this.underline = style.underline;
    this.inverse = style.inverse;
    this.foreground = style.foreground;
    this.background = style.background;
  }

  matches(style: AgentBridgeTerminalStyle): boolean {
    return this.bold === style.bold &&
      this.italic === style.italic &&
      this.underline === style.underline &&
      this.inverse === style.inverse &&
      this.foreground === style.foreground &&
      this.background === style.background;
  }
}

class AgentBridgeTerminalCell {
  text: string;
  style: AgentBridgeTerminalStyle;

  constructor(text: string, style: AgentBridgeTerminalStyle) {
    this.text = text;
    this.style = style.copy();
  }
}

class AgentBridgeTerminalScreenState {
  lines: Array<Array<AgentBridgeTerminalCell>>;
  row: number;
  col: number;

  constructor(lines: Array<Array<AgentBridgeTerminalCell>>, row: number, col: number) {
    this.lines = lines;
    this.row = row;
    this.col = col;
  }
}

export class AgentBridgeTerminalRenderer {
  private static readonly MAX_LINES: number = 2000;
  private static readonly MAX_COLUMNS: number = 500;
  private static readonly MAX_ESCAPE_LENGTH: number = 128;

  private lines: Array<Array<AgentBridgeTerminalCell>> = [];
  private row: number = 0;
  private col: number = 0;
  private escapeMode: number = 0;
  private escapeText: string = '';
  private style: AgentBridgeTerminalStyle = new AgentBridgeTerminalStyle();
  private savedRow: number = 0;
  private savedCol: number = 0;
  private scrollTop: number = 0;
  private scrollBottom: number = -1;
  private alternateScreen: AgentBridgeTerminalScreenState | null = null;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.lines = [];
    this.lines.push([]);
    this.row = 0;
    this.col = 0;
    this.escapeMode = 0;
    this.escapeText = '';
    this.style = new AgentBridgeTerminalStyle();
    this.savedRow = 0;
    this.savedCol = 0;
    this.scrollTop = 0;
    this.scrollBottom = -1;
    this.alternateScreen = null;
  }

  replace(text: string): void {
    this.reset();
    this.feed(text);
  }

  feed(text: string): void {
    const chars: Array<string> = Array.from(text);
    for (let index = 0; index < chars.length; index++) {
      this.consume(chars[index]);
    }
    this.trimHistory();
  }

  plainText(): string {
    let result = '';
    const lineCount = this.visibleLineCount();
    for (let rowIndex = 0; rowIndex < lineCount; rowIndex++) {
      if (rowIndex > 0) {
        result = result + '\n';
      }
      result = result + this.lineText(this.lines[rowIndex]);
    }
    return result;
  }

  renderRuns(): Array<AgentBridgeTerminalRenderRun> {
    const runs: Array<AgentBridgeTerminalRenderRun> = [];
    const lineCount = this.visibleLineCount();
    for (let rowIndex = 0; rowIndex < lineCount; rowIndex++) {
      const line = this.lines[rowIndex];
      const end = this.visibleCellCount(line);
      for (let colIndex = 0; colIndex < end; colIndex++) {
        this.appendRun(runs, line[colIndex].text, line[colIndex].style);
      }
      if (rowIndex + 1 < lineCount) {
        this.appendRun(runs, '\n', new AgentBridgeTerminalStyle());
      }
    }
    return runs;
  }

  private consume(ch: string): void {
    const code = ch.charCodeAt(0);
    if (this.escapeMode === 1) {
      if (ch === '[') {
        this.escapeMode = 2;
        this.escapeText = '';
      } else if (ch === ']') {
        this.escapeMode = 3;
        this.escapeText = '';
      } else if (ch === '7') {
        this.saveCursor();
        this.escapeMode = 0;
      } else if (ch === '8') {
        this.restoreCursor();
        this.escapeMode = 0;
      } else {
        this.escapeMode = 0;
      }
      return;
    }
    if (this.escapeMode === 2) {
      if (code >= 64 && code <= 126) {
        this.applyCsi(this.escapeText, ch);
        this.escapeMode = 0;
        this.escapeText = '';
      } else if (this.escapeText.length < AgentBridgeTerminalRenderer.MAX_ESCAPE_LENGTH) {
        this.escapeText = this.escapeText + ch;
      } else {
        this.escapeMode = 0;
        this.escapeText = '';
      }
      return;
    }
    if (this.escapeMode === 3) {
      if (code === 7) {
        this.escapeMode = 0;
      } else if (code === 27) {
        this.escapeMode = 4;
      }
      return;
    }
    if (this.escapeMode === 4) {
      this.escapeMode = ch === '\\' ? 0 : 3;
      return;
    }
    if (code === 27) {
      this.escapeMode = 1;
      return;
    }
    if (ch === '\r') {
      this.col = 0;
      return;
    }
    if (ch === '\n') {
      this.moveToNextLine();
      this.col = 0;
      this.trimHistory();
      return;
    }
    if (ch === '\b') {
      this.col = Math.max(0, this.col - 1);
      return;
    }
    if (ch === '\t') {
      const nextTab = Math.min(
        AgentBridgeTerminalRenderer.MAX_COLUMNS,
        this.col + (4 - (this.col % 4))
      );
      while (this.col < nextTab) {
        this.writeCell(' ');
      }
      return;
    }
    if (code < 32 || code === 127) {
      return;
    }
    this.writeCell(ch);
  }

  private writeCell(ch: string): void {
    if (this.col >= AgentBridgeTerminalRenderer.MAX_COLUMNS) {
      return;
    }
    this.ensureLine(this.row);
    const line = this.lines[this.row];
    while (line.length < this.col) {
      line.push(new AgentBridgeTerminalCell(' ', new AgentBridgeTerminalStyle()));
    }
    const cell = new AgentBridgeTerminalCell(ch, this.style);
    if (line.length === this.col) {
      line.push(cell);
    } else {
      line[this.col] = cell;
    }
    const width = this.characterWidth(ch);
    if (width === 2 && this.col + 1 < AgentBridgeTerminalRenderer.MAX_COLUMNS) {
      if (line.length === this.col + 1) {
        line.push(new AgentBridgeTerminalCell('', this.style));
      } else if (line.length > this.col + 1) {
        line[this.col + 1] = new AgentBridgeTerminalCell('', this.style);
      }
    }
    this.col = this.col + width;
  }

  private applyCsi(sequence: string, finalChar: string): void {
    if (finalChar === 'm') {
      this.applySgr(sequence);
      return;
    }
    if (finalChar === 'A') {
      this.row = Math.max(0, this.row - this.csiParam(sequence, 0, 1));
    } else if (finalChar === 'B') {
      this.row = this.row + this.csiParam(sequence, 0, 1);
      this.ensureLine(this.row);
    } else if (finalChar === 'C') {
      this.col = Math.min(AgentBridgeTerminalRenderer.MAX_COLUMNS, this.col + this.csiParam(sequence, 0, 1));
    } else if (finalChar === 'D') {
      this.col = Math.max(0, this.col - this.csiParam(sequence, 0, 1));
    } else if (finalChar === 'G') {
      this.col = Math.max(0, Math.min(AgentBridgeTerminalRenderer.MAX_COLUMNS, this.csiParam(sequence, 0, 1) - 1));
    } else if (finalChar === 'H' || finalChar === 'f') {
      this.row = Math.max(0, this.csiParam(sequence, 0, 1) - 1);
      this.col = Math.max(0, Math.min(AgentBridgeTerminalRenderer.MAX_COLUMNS, this.csiParam(sequence, 1, 1) - 1));
      this.ensureLine(this.row);
    } else if (finalChar === 'J') {
      this.eraseDisplay(this.csiParam(sequence, 0, 0));
    } else if (finalChar === 'K') {
      this.eraseLine(this.csiParam(sequence, 0, 0));
    } else if (finalChar === 's') {
      this.saveCursor();
    } else if (finalChar === 'u') {
      this.restoreCursor();
    } else if (finalChar === 'r') {
      this.setScrollRegion(sequence);
    } else if (finalChar === 'h' || finalChar === 'l') {
      this.applyPrivateMode(sequence, finalChar === 'h');
    }
  }

  private applySgr(sequence: string): void {
    const params = this.csiParams(sequence);
    if (params.length === 0) {
      params.push(0);
    }
    for (let index = 0; index < params.length; index++) {
      const value = params[index];
      if (value === 0) {
        this.style = new AgentBridgeTerminalStyle();
      } else if (value === 1) {
        this.style.bold = true;
      } else if (value === 3) {
        this.style.italic = true;
      } else if (value === 4) {
        this.style.underline = true;
      } else if (value === 7) {
        this.style.inverse = true;
      } else if (value === 22) {
        this.style.bold = false;
      } else if (value === 23) {
        this.style.italic = false;
      } else if (value === 24) {
        this.style.underline = false;
      } else if (value === 27) {
        this.style.inverse = false;
      } else if (value >= 30 && value <= 37) {
        this.style.foreground = this.colorForIndex(value - 30);
      } else if (value >= 90 && value <= 97) {
        this.style.foreground = this.colorForPaletteIndex(value - 90 + 8);
      } else if (value === 39) {
        this.style.foreground = AgentBridgeTerminalColor.DEFAULT;
      } else if (value >= 40 && value <= 47) {
        this.style.background = this.colorForIndex(value - 40);
      } else if (value >= 100 && value <= 107) {
        this.style.background = this.colorForPaletteIndex(value - 100 + 8);
      } else if (value === 49) {
        this.style.background = AgentBridgeTerminalColor.DEFAULT;
      } else if ((value === 38 || value === 48) && index + 1 < params.length) {
        const foreground = value === 38;
        const mode = params[index + 1];
        if (mode === 5 && index + 2 < params.length) {
          const color = this.colorForPaletteIndex(params[index + 2]);
          if (foreground) {
            this.style.foreground = color;
          } else {
            this.style.background = color;
          }
          index = index + 2;
        } else if (mode === 2 && index + 4 < params.length) {
          const color = this.rgbColor(params[index + 2], params[index + 3], params[index + 4]);
          if (foreground) {
            this.style.foreground = color;
          } else {
            this.style.background = color;
          }
          index = index + 4;
        }
      }
    }
  }

  private colorForIndex(index: number): string {
    if (index === 0) {
      return AgentBridgeTerminalColor.BLACK;
    }
    if (index === 1) {
      return AgentBridgeTerminalColor.RED;
    }
    if (index === 2) {
      return AgentBridgeTerminalColor.GREEN;
    }
    if (index === 3) {
      return AgentBridgeTerminalColor.YELLOW;
    }
    if (index === 4) {
      return AgentBridgeTerminalColor.BLUE;
    }
    if (index === 5) {
      return AgentBridgeTerminalColor.MAGENTA;
    }
    if (index === 6) {
      return AgentBridgeTerminalColor.CYAN;
    }
    return AgentBridgeTerminalColor.WHITE;
  }

  private colorForPaletteIndex(index: number): string {
    const normalized = Math.max(0, Math.min(255, index));
    if (normalized < 8) {
      return this.colorForIndex(normalized);
    }
    if (normalized < 16) {
      const brightColors: Array<string> = [
        '#FF666666', '#FFFF6666', '#FF66CC66', '#FFFFFF66',
        '#FF6699FF', '#FFFF66FF', '#FF66FFFF', '#FFFFFFFF'
      ];
      return brightColors[normalized - 8];
    }
    if (normalized < 232) {
      const cube = normalized - 16;
      const red = Math.floor(cube / 36);
      const green = Math.floor((cube % 36) / 6);
      const blue = cube % 6;
      return this.rgbColor(this.colorCubeValue(red), this.colorCubeValue(green), this.colorCubeValue(blue));
    }
    const gray = 8 + (normalized - 232) * 10;
    return this.rgbColor(gray, gray, gray);
  }

  private colorCubeValue(value: number): number {
    return value === 0 ? 0 : 55 + value * 40;
  }

  private rgbColor(red: number, green: number, blue: number): string {
    return '#FF' + this.hexByte(red) + this.hexByte(green) + this.hexByte(blue);
  }

  private hexByte(value: number): string {
    const normalized = Math.max(0, Math.min(255, Math.floor(value)));
    const text = normalized.toString(16).toUpperCase();
    return text.length < 2 ? '0' + text : text;
  }

  private csiParams(sequence: string): Array<number> {
    const cleaned = this.cleanCsi(sequence);
    const result: Array<number> = [];
    if (cleaned.length === 0) {
      return result;
    }
    const parts = cleaned.split(';');
    for (let index = 0; index < parts.length; index++) {
      const value = Number(parts[index]);
      result.push(Number.isNaN(value) ? 0 : Math.floor(value));
    }
    return result;
  }

  private csiParam(sequence: string, index: number, fallback: number): number {
    const params = this.csiParams(sequence);
    if (index < 0 || index >= params.length || params[index] <= 0) {
      return fallback;
    }
    return params[index];
  }

  private cleanCsi(sequence: string): string {
    let result = '';
    for (let index = 0; index < sequence.length; index++) {
      const ch = sequence.charAt(index);
      const code = ch.charCodeAt(0);
      if ((code >= 48 && code <= 57) || ch === ';') {
        result = result + ch;
      }
    }
    return result;
  }

  private saveCursor(): void {
    this.savedRow = this.row;
    this.savedCol = this.col;
  }

  private restoreCursor(): void {
    this.row = Math.max(0, this.savedRow);
    this.col = Math.max(0, Math.min(AgentBridgeTerminalRenderer.MAX_COLUMNS, this.savedCol));
    this.ensureLine(this.row);
  }

  private setScrollRegion(sequence: string): void {
    const params = this.csiParams(sequence);
    this.scrollTop = params.length > 0 && params[0] > 0 ? params[0] - 1 : 0;
    this.scrollBottom = params.length > 1 && params[1] > 0 ? params[1] - 1 : -1;
    if (this.scrollBottom >= 0 && this.scrollBottom < this.scrollTop) {
      this.scrollTop = 0;
      this.scrollBottom = -1;
    }
    this.row = this.scrollTop;
    this.col = 0;
    this.ensureLine(this.row);
  }

  private applyPrivateMode(sequence: string, enabled: boolean): void {
    if (sequence.indexOf('?1049') < 0 && sequence.indexOf('?47') < 0 && sequence.indexOf('?1047') < 0) {
      return;
    }
    if (enabled && this.alternateScreen === null) {
      this.alternateScreen = new AgentBridgeTerminalScreenState(this.cloneLines(this.lines), this.row, this.col);
      this.lines = [];
      this.lines.push([]);
      this.row = 0;
      this.col = 0;
    } else if (!enabled && this.alternateScreen !== null) {
      this.lines = this.alternateScreen.lines;
      this.row = this.alternateScreen.row;
      this.col = this.alternateScreen.col;
      this.alternateScreen = null;
    }
  }

  private cloneLines(source: Array<Array<AgentBridgeTerminalCell>>): Array<Array<AgentBridgeTerminalCell>> {
    const result: Array<Array<AgentBridgeTerminalCell>> = [];
    for (let rowIndex = 0; rowIndex < source.length; rowIndex++) {
      const row: Array<AgentBridgeTerminalCell> = [];
      for (let colIndex = 0; colIndex < source[rowIndex].length; colIndex++) {
        const cell = source[rowIndex][colIndex];
        row.push(new AgentBridgeTerminalCell(cell.text, cell.style));
      }
      result.push(row);
    }
    return result;
  }

  private moveToNextLine(): void {
    const regionBottom = this.scrollBottom >= 0 ? this.scrollBottom : this.lines.length;
    if (this.row >= regionBottom && this.scrollBottom >= 0) {
      this.ensureLine(this.scrollBottom);
      this.lines.splice(this.scrollTop, 1);
      this.lines.splice(this.scrollBottom, 0, []);
      this.row = this.scrollBottom;
      return;
    }
    this.row = this.row + 1;
    this.ensureLine(this.row);
  }

  private characterWidth(ch: string): number {
    if (ch.length === 0) {
      return 0;
    }
    const code = ch.codePointAt(0);
    if (code === undefined) {
      return 1;
    }
    if ((code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7A3) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE10 && code <= 0xFE6F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0x1F300 && code <= 0x1FAFF)) {
      return 2;
    }
    return 1;
  }

  private eraseDisplay(mode: number): void {
    if (mode === 2 || mode === 3) {
      this.lines = [];
      this.lines.push([]);
      this.row = 0;
      this.col = 0;
      return;
    }
    this.ensureLine(this.row);
    if (mode === 1) {
      for (let index = 0; index < this.row; index++) {
        this.lines[index] = [];
      }
      this.eraseLine(1);
      return;
    }
    this.eraseLine(0);
    while (this.lines.length > this.row + 1) {
      this.lines.pop();
    }
  }

  private eraseLine(mode: number): void {
    this.ensureLine(this.row);
    const line = this.lines[this.row];
    if (mode === 2) {
      this.lines[this.row] = [];
      return;
    }
    if (mode === 1) {
      const end = Math.min(this.col + 1, line.length);
      for (let index = 0; index < end; index++) {
        line[index] = new AgentBridgeTerminalCell(' ', new AgentBridgeTerminalStyle());
      }
      return;
    }
    if (this.col < line.length) {
      line.splice(this.col, line.length - this.col);
    }
  }

  private ensureLine(row: number): void {
    while (this.lines.length <= row) {
      this.lines.push([]);
    }
  }

  private trimHistory(): void {
    if (this.lines.length <= AgentBridgeTerminalRenderer.MAX_LINES) {
      return;
    }
    const removeCount = this.lines.length - AgentBridgeTerminalRenderer.MAX_LINES;
    this.lines.splice(0, removeCount);
    this.row = Math.max(0, this.row - removeCount);
  }

  private visibleLineCount(): number {
    let end = this.lines.length;
    while (end > 1 && this.visibleCellCount(this.lines[end - 1]) === 0) {
      end = end - 1;
    }
    return end;
  }

  private visibleCellCount(line: Array<AgentBridgeTerminalCell>): number {
    let end = line.length;
    while (end > 0 && line[end - 1].text === ' ') {
      end = end - 1;
    }
    return end;
  }

  private lineText(line: Array<AgentBridgeTerminalCell>): string {
    let result = '';
    const end = this.visibleCellCount(line);
    for (let index = 0; index < end; index++) {
      result = result + line[index].text;
    }
    return result;
  }

  private appendRun(
    runs: Array<AgentBridgeTerminalRenderRun>,
    text: string,
    style: AgentBridgeTerminalStyle
  ): void {
    if (text.length === 0) {
      return;
    }
    if (runs.length > 0) {
      const last = runs[runs.length - 1];
      if (last.matches(style)) {
        last.text = last.text + text;
        return;
      }
    }
    runs.push(new AgentBridgeTerminalRenderRun('terminal-run-' + String(runs.length), text, style));
  }
}
