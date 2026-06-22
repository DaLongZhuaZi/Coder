import { relationalStore } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { uiContextManager } from '../../../platformOhos/UIContextManager';
import { IRelationalStore, NGFRdbCell, NGFRdbConfig, NGFRdbRow } from '../contracts/IRelationalStore';
import { logger } from '../../../utils/Logger';

const TAG: string = 'RdbManagerFacade';

class RdbManagerFacade implements IRelationalStore {
  private store: relationalStore.RdbStore | null = null;
  private isInitialized: boolean = false;
  private currentStoreName: string = '';

  isReadyForStore(name: string): boolean {
    return this.isInitialized && this.store !== null && this.currentStoreName === name;
  }

  async init(config: NGFRdbConfig, createTableSqls: string[]): Promise<boolean> {
    const context: common.UIAbilityContext | null = uiContextManager.getFullAbilityContext();
    if (!context) {
      logger.error(TAG, '缺少 UIAbilityContext，无法初始化关系型数据库');
      return false;
    }

    const rdbConfig: relationalStore.StoreConfig = {
      name: config.name,
      securityLevel: config.securityLevel ?? relationalStore.SecurityLevel.S1
    };

    try {
      if (this.isReadyForStore(config.name)) {
        return true;
      }

      if (this.isInitialized && this.store && this.currentStoreName !== config.name) {
        await this.store.close();
        this.store = null;
        this.isInitialized = false;
        this.currentStoreName = '';
      }

      if (!this.store) {
        this.store = await relationalStore.getRdbStore(context, rdbConfig);
        this.currentStoreName = config.name;
      }

      for (let i: number = 0; i < createTableSqls.length; i++) {
        await this.store.executeSql(createTableSqls[i]);
        logger.debug(TAG, '执行建表 SQL 成功: ' + createTableSqls[i]);
      }

      if (this.store.version === 0) {
        this.store.version = 1;
      }

      if (this.store.version < 1) {
        this.store.version = 1;
      }

      this.isInitialized = true;
      logger.info(TAG, '关系型数据库 ' + config.name + ' 初始化完成');
      return true;
    } catch (e) {
      logger.error(TAG, '关系型数据库初始化失败: ' + e);
      return false;
    }
  }

  async queryRows(sql: string, bindArgs?: Array<relationalStore.ValueType>): Promise<Array<NGFRdbRow>> {
    const store = this.requireStore();
    let resultSet: relationalStore.ResultSet | null = null;
    try {
      if (bindArgs) {
        resultSet = await store.querySql(sql, bindArgs);
      } else {
        resultSet = await store.querySql(sql);
      }
      const results: Array<NGFRdbRow> = [];

      while (resultSet.goToNextRow()) {
        const cells: Array<NGFRdbCell> = [];
        for (let i: number = 0; i < resultSet.columnCount; i++) {
          const columnName = resultSet.getColumnName(i);
          const isNull = resultSet.isColumnNull(i);
          let value = '';
          if (!isNull) {
            value = resultSet.getString(i);
          }
          cells.push(new NGFRdbCell(columnName, value, isNull));
        }
        results.push(new NGFRdbRow(cells));
      }

      return results;
    } catch (e) {
      logger.error(TAG, '查询 SQL 行对象失败: ' + sql + ' | err: ' + e);
      throw new Error('查询 SQL 行对象失败: ' + sql + ' | err: ' + e);
    } finally {
      if (resultSet) {
        this.closeResultSetSafely(resultSet, sql);
      }
    }
  }

  async executeSql(sql: string, bindArgs?: Array<relationalStore.ValueType>): Promise<void> {
    const store = this.requireStore();
    try {
      if (bindArgs) {
        await store.executeSql(sql, bindArgs);
      } else {
        await store.executeSql(sql);
      }
    } catch (e) {
      logger.error(TAG, '执行 SQL 失败: ' + sql + ' | err: ' + e);
      throw new Error('执行 SQL 失败: ' + sql + ' | err: ' + e);
    }
  }

  async beginTransaction(): Promise<void> {
    const store = this.requireStore();
    try {
      await store.beginTransaction();
    } catch (e) {
      logger.error(TAG, 'beginTransaction failed: ' + e);
      throw new Error('beginTransaction failed: ' + e);
    }
  }

  async commit(): Promise<void> {
    const store = this.requireStore();
    try {
      await store.commit();
    } catch (e) {
      logger.error(TAG, 'commit failed: ' + e);
      throw new Error('commit failed: ' + e);
    }
  }

  async rollback(): Promise<void> {
    const store = this.requireStore();
    try {
      await store.rollBack();
    } catch (e) {
      logger.error(TAG, 'rollback failed: ' + e);
      throw new Error('rollback failed: ' + e);
    }
  }

  private requireStore(): relationalStore.RdbStore {
    if (!this.isInitialized || !this.store) {
      throw new Error('数据库尚未初始化，请先调用 init()');
    }
    return this.store;
  }

  private closeResultSetSafely(resultSet: relationalStore.ResultSet, sql: string): void {
    try {
      resultSet.close();
    } catch (e) {
      logger.warn(TAG, '关闭查询结果集失败: ' + sql + ' | err: ' + e);
    }
  }
}

export const ngfRdbManager: IRelationalStore = new RdbManagerFacade();
