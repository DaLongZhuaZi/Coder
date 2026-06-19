let storage = new LocalStorage();

@Entry(storage)
@Component
struct WidgetCard {
  @LocalStorageProp('frameworkStatus') frameworkStatus: string = '初始化中...';
  @LocalStorageProp('lastUpdate') lastUpdate: string = '--:--:--';

  build() {
    Column() {
      // Header
      Row() {
        Image($r('app.media.startIcon'))
          .width(20).height(20).margin({ right: 8 })
        Text($r('app.string.widget_title'))
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
        Blank()
        // Refresh Button
        Text('↻')
          .fontSize(18)
          .fontColor($r('app.color.text_secondary'))
          .fontWeight(FontWeight.Bold)
          .onClick(() => {
            postCardAction(this, {
              action: 'message',
              params: { message: 'refresh' }
            });
          })
      }
      .width('100%')
      .height(30)
      .padding({ left: 12, right: 12, top: 8 })

      // Status Content
      Column() {
        Text(this.frameworkStatus)
          .fontSize(20)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.button_primary'))
          .margin({ top: 8, bottom: 4 })
        Text('最后更新: ' + this.lastUpdate)
          .fontSize(10)
          .fontColor($r('app.color.text_secondary'))
      }
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .width('100%')

      // Actions Footer
      Row() {
        // Router Action 1
        Button('主应用')
          .fontSize(10)
          .height(24)
          .backgroundColor($r('app.color.background_surface'))
          .fontColor($r('app.color.text_primary'))
          .onClick(() => {
            postCardAction(this, {
              action: 'router',
              abilityName: 'EntryAbility',
              params: { source: 'widget_main' }
            });
          })
        
        // Router Action 2
        Button('独立实例')
          .fontSize(10)
          .height(24)
          .backgroundColor($r('app.color.component_control_bg'))
          .fontColor($r('app.color.button_primary'))
          .onClick(() => {
            postCardAction(this, {
              action: 'router',
              abilityName: 'MultitonEntryAbility',
              params: {
                instanceId: 'WidgetInstance',
                targetRouteName: 'SystemResourcePreview',
                targetTitle: 'Symbol 预览'
              }
            });
          })
      }
      .width('100%')
      .justifyContent(FlexAlign.SpaceEvenly)
      .padding({ bottom: 12 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.panel_background'))
    .borderRadius(16)
  }
}
