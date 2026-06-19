import {
  BlurStrategy,
  hdsMaterial,
  HdsNavigationBadgeIconOptions,
  HdsNavigationBackgroundStyle,
  HdsNavigationIconOptions,
  HdsNavigationMenuContentOptions,
  HdsNavigationMenuItemOptions,
  HdsNavigationTitle,
  HdsNavigationTitleBarOptions,
  HdsNavigationTitleBarStyle,
  HdsNavigationTitleStyle,
  HdsTitleBarContentStyle,
  IconStyleMode,
  IconType,
  ScrollEffectOptions,
  ScrollEffectType,
  SystemMaterialParams,
  TextStyleMode,
  TitleBarContentOptions,
  TitleBarStyleOptions
} from '@kit.UIDesignKit';
import { NGFHdsEffectPresetFactory } from './NGFHdsEffectPresets';

export class NGFHdsTitleBarMenuAction {
  icon: IconType;
  label: ResourceStr;
  action: Callback<void>;

  constructor(icon: IconType, label: ResourceStr, action: Callback<void>) {
    this.icon = icon;
    this.label = label;
    this.action = action;
  }
}

class NGFHdsNavigationTitle implements HdsNavigationTitle {
  mainTitle: ResourceStr;
  subTitle?: ResourceStr;

  constructor(mainTitle: ResourceStr, subTitle?: ResourceStr) {
    this.mainTitle = mainTitle;
    if (subTitle !== undefined) {
      this.subTitle = subTitle;
    }
  }
}

class NGFHdsNavigationBackgroundStyle implements HdsNavigationBackgroundStyle {
  backgroundColor?: ResourceColor;
  maskExtraHeight?: number;
  blurRadius?: number;

  constructor(backgroundColor: ResourceColor, blurRadius: number) {
    this.backgroundColor = backgroundColor;
    this.maskExtraHeight = 28;
    this.blurRadius = blurRadius;
  }
}

class NGFHdsNavigationTitleStyle implements HdsNavigationTitleStyle {
  mainTitleColor?: ResourceColor;
  subTitleColor?: ResourceColor;
  mainTitleShadowColor?: ResourceColor;
  subTitleShadowColor?: ResourceColor;

  constructor(mainTitleColor: ResourceColor, subTitleColor: ResourceColor) {
    this.mainTitleColor = mainTitleColor;
    this.subTitleColor = subTitleColor;
    this.mainTitleShadowColor = $r('app.color.circle_shadow_light');
    this.subTitleShadowColor = $r('app.color.card_shadow_light');
  }
}

class NGFHdsTitleBarContentStyle implements HdsTitleBarContentStyle {
  titleStyle?: HdsNavigationTitleStyle;

  constructor(titleStyle: HdsNavigationTitleStyle) {
    this.titleStyle = titleStyle;
  }
}

class NGFHdsNavigationTitleBarStyle implements HdsNavigationTitleBarStyle {
  backgroundStyle?: HdsNavigationBackgroundStyle;
  contentStyle?: HdsTitleBarContentStyle;

  constructor(backgroundStyle: HdsNavigationBackgroundStyle, contentStyle: HdsTitleBarContentStyle) {
    this.backgroundStyle = backgroundStyle;
    this.contentStyle = contentStyle;
  }
}

class NGFHdsScrollEffectOptions implements ScrollEffectOptions {
  enableScrollEffect?: boolean;
  scrollEffectType?: ScrollEffectType;

  constructor(scrollEffectType: ScrollEffectType) {
    this.enableScrollEffect = true;
    this.scrollEffectType = scrollEffectType;
  }
}

class NGFHdsTitleBarStyleOptions implements TitleBarStyleOptions {
  scrollEffectOpts?: ScrollEffectOptions;
  originalStyle?: HdsNavigationTitleBarStyle;
  scrollEffectStyle?: HdsNavigationTitleBarStyle;
  blurStrategy?: BlurStrategy;
  thermoCtrl?: boolean;
  systemMaterialEffect?: SystemMaterialParams;

  constructor(
    originalStyle: HdsNavigationTitleBarStyle,
    scrollEffectStyle: HdsNavigationTitleBarStyle,
    systemMaterialEffect: SystemMaterialParams,
    scrollEffectType: ScrollEffectType = ScrollEffectType.GRADIENT_BLUR
  ) {
    this.scrollEffectOpts = new NGFHdsScrollEffectOptions(scrollEffectType);
    this.originalStyle = originalStyle;
    this.scrollEffectStyle = scrollEffectStyle;
    this.blurStrategy = BlurStrategy.ADAPTIVE;
    this.thermoCtrl = false;
    this.systemMaterialEffect = systemMaterialEffect;
  }
}

class NGFHdsNavigationIconOptions implements HdsNavigationIconOptions {
  icon?: IconType;
  label?: ResourceStr;
  isEnabled?: boolean;
  action?: Callback<void>;
  type?: IconStyleMode | TextStyleMode;

  constructor(icon: IconType, label: ResourceStr, action: Callback<void>) {
    this.icon = icon;
    this.label = label;
    this.isEnabled = true;
    this.action = action;
    this.type = IconStyleMode.NORMAL;
  }
}

class NGFHdsNavigationMenuItemOptions implements HdsNavigationBadgeIconOptions {
  content?: HdsNavigationIconOptions;

  constructor(content: HdsNavigationIconOptions) {
    this.content = content;
  }
}

class NGFHdsNavigationMenuContentOptions implements HdsNavigationMenuContentOptions {
  value?: Array<HdsNavigationMenuItemOptions>;
  maxCount?: number;

  constructor(value: Array<HdsNavigationMenuItemOptions>, maxCount: number) {
    this.value = value;
    this.maxCount = maxCount;
  }
}

class NGFHdsTitleBarContentOptions implements TitleBarContentOptions {
  title?: HdsNavigationTitle;
  menu?: HdsNavigationMenuContentOptions;

  constructor(title: HdsNavigationTitle, menu?: HdsNavigationMenuContentOptions) {
    this.title = title;
    if (menu !== undefined) {
      this.menu = menu;
    }
  }
}

class NGFHdsNavigationTitleBarOptions implements HdsNavigationTitleBarOptions {
  style?: TitleBarStyleOptions;
  content?: TitleBarContentOptions;
  enableHoverMode?: boolean;
  avoidLayoutSafeArea?: boolean;
  enableComponentSafeArea?: boolean;

  constructor(
    content: TitleBarContentOptions,
    style: TitleBarStyleOptions,
    avoidLayoutSafeArea: boolean,
    enableComponentSafeArea: boolean
  ) {
    this.content = content;
    this.style = style;
    this.enableHoverMode = false;
    this.avoidLayoutSafeArea = avoidLayoutSafeArea;
    this.enableComponentSafeArea = enableComponentSafeArea;
  }
}

export class NGFHdsTitleBarOptionsFactory {
  private static buildMenuContent(
    menuActions: Array<NGFHdsTitleBarMenuAction>,
    maxMenuCount: number
  ): HdsNavigationMenuContentOptions {
    const menuItems: Array<HdsNavigationMenuItemOptions> = [];
    for (let index = 0; index < menuActions.length; index++) {
      const menuAction = menuActions[index];
      const iconOptions = new NGFHdsNavigationIconOptions(menuAction.icon, menuAction.label, menuAction.action);
      menuItems.push(new NGFHdsNavigationMenuItemOptions(iconOptions));
    }
    return new NGFHdsNavigationMenuContentOptions(menuItems, maxMenuCount);
  }

  static build(
    mainTitle: ResourceStr,
    subTitle: ResourceStr,
    backgroundColor: ResourceColor,
    materialLevel: hdsMaterial.MaterialLevel,
    avoidLayoutSafeArea: boolean = false,
    enableComponentSafeArea: boolean = false
  ): HdsNavigationTitleBarOptions {
    const originalTitleStyle = new NGFHdsNavigationTitleStyle($r('app.color.text_white'), $r('app.color.glass_chip_overlay'));
    const scrollTitleStyle = new NGFHdsNavigationTitleStyle($r('app.color.text_white'), $r('app.color.text_white_medium'));
    const originalContentStyle = new NGFHdsTitleBarContentStyle(originalTitleStyle);
    const scrollContentStyle = new NGFHdsTitleBarContentStyle(scrollTitleStyle);
    const originalBackgroundStyle = new NGFHdsNavigationBackgroundStyle(backgroundColor, 18);
    const scrollBackgroundStyle = new NGFHdsNavigationBackgroundStyle(backgroundColor, 28);
    const originalBarStyle = new NGFHdsNavigationTitleBarStyle(originalBackgroundStyle, originalContentStyle);
    const scrollBarStyle = new NGFHdsNavigationTitleBarStyle(scrollBackgroundStyle, scrollContentStyle);
    const materialParams = NGFHdsEffectPresetFactory.buildSystemMaterialParams(hdsMaterial.MaterialType.IMMERSIVE, materialLevel);
    const content = new NGFHdsTitleBarContentOptions(new NGFHdsNavigationTitle(mainTitle, subTitle));
    const style = new NGFHdsTitleBarStyleOptions(originalBarStyle, scrollBarStyle, materialParams);
    return new NGFHdsNavigationTitleBarOptions(content, style, avoidLayoutSafeArea, enableComponentSafeArea);
  }

  static buildTransparentSurface(
    mainTitle: ResourceStr,
    subTitle: ResourceStr,
    materialLevel: hdsMaterial.MaterialLevel,
    avoidLayoutSafeArea: boolean = false,
    enableComponentSafeArea: boolean = false
  ): HdsNavigationTitleBarOptions {
    const originalTitleStyle = new NGFHdsNavigationTitleStyle($r('app.color.text_body'), $r('app.color.text_secondary'));
    const scrollTitleStyle = new NGFHdsNavigationTitleStyle($r('app.color.text_body'), $r('app.color.text_secondary'));
    const originalContentStyle = new NGFHdsTitleBarContentStyle(originalTitleStyle);
    const scrollContentStyle = new NGFHdsTitleBarContentStyle(scrollTitleStyle);
    const originalBackgroundStyle = new NGFHdsNavigationBackgroundStyle('#00000000', 18);
    const scrollBackgroundStyle = new NGFHdsNavigationBackgroundStyle('#00000000', 28);
    const originalBarStyle = new NGFHdsNavigationTitleBarStyle(originalBackgroundStyle, originalContentStyle);
    const scrollBarStyle = new NGFHdsNavigationTitleBarStyle(scrollBackgroundStyle, scrollContentStyle);
    const materialParams = NGFHdsEffectPresetFactory.buildSystemMaterialParams(hdsMaterial.MaterialType.IMMERSIVE, materialLevel);
    const content = new NGFHdsTitleBarContentOptions(new NGFHdsNavigationTitle(mainTitle, subTitle));
    const style = new NGFHdsTitleBarStyleOptions(
      originalBarStyle,
      scrollBarStyle,
      materialParams,
      ScrollEffectType.IMMERSIVE_GRADIENT_BLUR
    );
    return new NGFHdsNavigationTitleBarOptions(content, style, avoidLayoutSafeArea, enableComponentSafeArea);
  }

  static buildTransparentSurfaceWithMenu(
    mainTitle: ResourceStr,
    subTitle: ResourceStr,
    materialLevel: hdsMaterial.MaterialLevel,
    menuActions: Array<NGFHdsTitleBarMenuAction>,
    maxMenuCount: number = 3,
    avoidLayoutSafeArea: boolean = false,
    enableComponentSafeArea: boolean = false
  ): HdsNavigationTitleBarOptions {
    const originalTitleStyle = new NGFHdsNavigationTitleStyle($r('app.color.text_body'), $r('app.color.text_secondary'));
    const scrollTitleStyle = new NGFHdsNavigationTitleStyle($r('app.color.text_body'), $r('app.color.text_secondary'));
    const originalContentStyle = new NGFHdsTitleBarContentStyle(originalTitleStyle);
    const scrollContentStyle = new NGFHdsTitleBarContentStyle(scrollTitleStyle);
    const originalBackgroundStyle = new NGFHdsNavigationBackgroundStyle('#00000000', 18);
    const scrollBackgroundStyle = new NGFHdsNavigationBackgroundStyle('#00000000', 28);
    const originalBarStyle = new NGFHdsNavigationTitleBarStyle(originalBackgroundStyle, originalContentStyle);
    const scrollBarStyle = new NGFHdsNavigationTitleBarStyle(scrollBackgroundStyle, scrollContentStyle);
    const materialParams = NGFHdsEffectPresetFactory.buildSystemMaterialParams(hdsMaterial.MaterialType.IMMERSIVE, materialLevel);
    const menu = NGFHdsTitleBarOptionsFactory.buildMenuContent(menuActions, maxMenuCount);
    const content = new NGFHdsTitleBarContentOptions(new NGFHdsNavigationTitle(mainTitle, subTitle), menu);
    const style = new NGFHdsTitleBarStyleOptions(
      originalBarStyle,
      scrollBarStyle,
      materialParams,
      ScrollEffectType.IMMERSIVE_GRADIENT_BLUR
    );
    return new NGFHdsNavigationTitleBarOptions(content, style, avoidLayoutSafeArea, enableComponentSafeArea);
  }
}
