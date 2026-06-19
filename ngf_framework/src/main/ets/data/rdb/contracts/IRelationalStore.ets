import { relationalStore } from '@kit.ArkData';

export interface NGFRdbConfig {
  name: string;
  securityLevel?: number; // e.g., relationalStore.SecurityLevel.S1
}

export class NGFRdbCell {
  columnName: string;
  value: string;
  isNull: boolean;

  constructor(columnName: string, value: string, isNull: boolean) {
    this.columnName = columnName;
    this.value = value;
    this.isNull = isNull;
  }
}

export class NGFRdbRow {
  private readonly cells: Array<NGFRdbCell>;

  constructor(cells: Array<NGFRdbCell>) {
    this.cells = cells;
  }

  getString(columnName: string, defaultValue: string): string {
    const cell = this.findCell(columnName);
    if (!cell || cell.isNull) {
      return defaultValue;
    }
    return cell.value;
  }

  getNumber(columnName: string, defaultValue: number): number {
    const cell = this.findCell(columnName);
    if (!cell || cell.isNull || cell.value.length === 0) {
      return defaultValue;
    }
    const parsed = Number(cell.value);
    if (Number.isNaN(parsed)) {
      return defaultValue;
    }
    return parsed;
  }

  getBoolean(columnName: string, defaultValue: boolean): boolean {
    const cell = this.findCell(columnName);
    if (!cell || cell.isNull || cell.value.length === 0) {
      return defaultValue;
    }
    const normalized = cell.value.toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    return defaultValue;
  }

  private findCell(columnName: string): NGFRdbCell | null {
    for (let index = 0; index < this.cells.length; index++) {
      const cell = this.cells[index];
      if (cell.columnName === columnName) {
        return cell;
      }
    }
    return null;
  }
}

export interface IRelationalStore {
  /**
   * 检查当前进程内是否已经初始化到指定数据库。
   */
  isReadyForStore(name: string): boolean;

  /**
   * 初始化数据库，创建对应的表
   */
  init(config: NGFRdbConfig, createTableSqls: string[]): Promise<boolean>;

  /**
   * 执行原生 SQL (如 INSERT, UPDATE)
   */
  executeSql(sql: string, bindArgs?: Array<relationalStore.ValueType>): Promise<void>;

  /**
   * 查询 SQL，并以类型化行对象返回，避免业务层动态索引列名。
   */
  queryRows(sql: string, bindArgs?: Array<relationalStore.ValueType>): Promise<Array<NGFRdbRow>>;

  /**
   * 开启事务
   */
  beginTransaction(): Promise<void>;

  /**
   * 提交事务
   */
  commit(): Promise<void>;

  /**
   * 回滚事务
   */
  rollback(): Promise<void>;
}
