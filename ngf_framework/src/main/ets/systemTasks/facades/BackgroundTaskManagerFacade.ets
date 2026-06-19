import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { wantAgent, WantAgent } from '@kit.AbilityKit';
import { IBackgroundTaskManager } from '../contracts/IBackgroundTaskManager';
import { uiContextManager } from '../../platformOhos/UIContextManager';
import { logger } from '../../utils/Logger';

const TAG: string = 'BackgroundTaskManagerFacade';

class BackgroundTaskManagerFacade implements IBackgroundTaskManager {
  private activeTaskIds: Set<string> = new Set();
  private isContinuousTaskRunning: boolean = false;
  private startTaskPromise: Promise<boolean> | null = null;

  async startContinuousTask(taskId: string, title: string, content: string): Promise<boolean> {
    if (taskId.length > 0) {
      this.activeTaskIds.add(taskId);
    }
    if (this.isContinuousTaskRunning) {
      return true;
    }
    const pendingStart = this.startTaskPromise;
    if (pendingStart !== null) {
      return pendingStart;
    }
    const promise = this.startContinuousTaskInternal(taskId, title, content);
    this.startTaskPromise = promise;
    const result = await promise;
    this.startTaskPromise = null;
    return result;
  }

  private async startContinuousTaskInternal(taskId: string, title: string, content: string): Promise<boolean> {
    const context = uiContextManager.getFullAbilityContext();
    if (!context) {
      logger.error(TAG, '无 UIAbilityContext，无法启动后台长时任务');
      if (taskId.length > 0) {
        this.activeTaskIds.delete(taskId);
      }
      return false;
    }
    try {
      const wantAgentInfo: wantAgent.WantAgentInfo = {
        wants: [
          {
            bundleName: context.abilityInfo.bundleName,
            abilityName: context.abilityInfo.name
          }
        ],
        actionType: wantAgent.OperationType.START_ABILITY,
        requestCode: 0,
        wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
      };
      const wa: WantAgent = await wantAgent.getWantAgent(wantAgentInfo);

      await backgroundTaskManager.startBackgroundRunning(context, backgroundTaskManager.BackgroundMode.DATA_TRANSFER, wa);
      this.isContinuousTaskRunning = true;
      if (this.activeTaskIds.size === 0) {
        const stopped: boolean = await this.stopContinuousTask();
        return stopped;
      }
      logger.info(TAG, '后台长时任务已启动: TaskID=' + taskId + ', title=' + title + ', content=' + content);
      return true;
    } catch (e) {
      logger.error(TAG, '启动后台长时任务失败: ' + e);
      this.isContinuousTaskRunning = false;
      this.activeTaskIds.clear();
      return false;
    }
  }

  async stopContinuousTask(taskId?: string): Promise<boolean> {
    if (taskId !== undefined && taskId.length > 0) {
      this.activeTaskIds.delete(taskId);
    } else {
      this.activeTaskIds.clear();
    }
    if (this.activeTaskIds.size > 0) {
      logger.debug(TAG, '后台长时任务仍有活动请求，暂不停止: remaining=' + String(this.activeTaskIds.size));
      return true;
    }
    if (!this.isContinuousTaskRunning) {
      return true;
    }
    const context = uiContextManager.getFullAbilityContext();
    if (!context) {
      logger.error(TAG, '无 UIAbilityContext，无法停止后台长时任务');
      return false;
    }
    try {
      await backgroundTaskManager.stopBackgroundRunning(context);
      this.isContinuousTaskRunning = false;
      logger.info(TAG, '后台长时任务已停止');
      return true;
    } catch (e) {
      logger.error(TAG, '停止后台长时任务失败: ' + e);
      return false;
    }
  }
}

export const ngfBackgroundTaskManager: IBackgroundTaskManager = new BackgroundTaskManagerFacade();
