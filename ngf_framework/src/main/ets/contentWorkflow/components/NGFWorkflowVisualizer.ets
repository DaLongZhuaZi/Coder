import { logger } from '../../utils/Logger';

@Component
export struct NGFWorkflowVisualizer {
  @State workflows: Array<string> = [];
  @State selectedWorkflow: string = '';
  @State isExecuting: boolean = false;
  @State executionResult: string = '';

  aboutToAppear(): void {
    logger.info('NGFWorkflowVisualizer', '可视化调试器初始化');
    // 在真实场景下这里会调用 ngfWorkflowDefinitionManagerFacade.listWorkflowNames()
    // 此处简化为 UI 骨架
    this.workflows = ['example_workflow_1', 'example_parallel_workflow'];
  }

  build() {
    Column({ space: 16 }) {
      Text('Workflow Visual Debugger')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.text_primary'))
        .margin({ top: 16 })

      List({ space: 8 }) {
        ForEach(this.workflows, (wfName: string) => {
          ListItem() {
            Row() {
              Text(wfName)
                .fontSize(16)
                .fontColor(this.selectedWorkflow === wfName ? $r('app.color.button_primary') : $r('app.color.text_body'))
              Blank()
              Button('Run')
                .onClick(() => {
                  this.selectedWorkflow = wfName;
                  this.runWorkflow(wfName);
                })
            }
            .width('100%')
            .padding(12)
            .backgroundColor($r('app.color.panel_background'))
            .borderRadius(8)
            .border({ width: 1, color: $r('app.color.card_border') })
          }
        }, (item: string) => item)
      }
      .width('100%')
      .layoutWeight(1)

      Divider()

      Column({ space: 8 }) {
        Text('Execution Log:')
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
        Scroll() {
          Text(this.executionResult)
            .fontSize(14)
            .fontFamily('monospace')
            .fontColor(this.isExecuting ? $r('app.color.tag_amber') : (this.executionResult.includes('FAILED') ? $r('app.color.tag_red') : $r('app.color.tag_green')))
        }
        .width('100%')
        .height(150)
        .backgroundColor($r('app.color.background_surface'))
        .padding(8)
        .borderRadius(8)
        .border({ width: 1, color: $r('app.color.card_border') })
      }
      .width('100%')
      .padding({ bottom: 16 })
    }
    .width('100%')
    .height('100%')
    .padding(16)
    .backgroundColor($r('app.color.background_primary'))
  }

  private runWorkflow(name: string): void {
    this.isExecuting = true;
    this.executionResult = '[' + String(new Date().toISOString()) + '] Starting workflow: ' + name + '...\\n';
    
    // 模拟工作流执行过程，真实中通过 ngfWorkflowEngineFacade 调度
    setTimeout(() => {
      this.isExecuting = false;
      this.executionResult += '[' + String(new Date().toISOString()) + '] Workflow ' + name + ' COMPLETED successfully.';
    }, 2000);
  }
}
