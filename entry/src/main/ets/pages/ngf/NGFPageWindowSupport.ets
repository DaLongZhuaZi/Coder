import window from '@ohos.window';
import {
  logger,
  NGFDisplayMode,
  NGFPageWindowProfile,
  NGFWindowOrientationPreference,
  NGFWindowSystemBarPolicy,
  NGFWindowSystemBarStyle,
  ngfPagePolicyHostFacade,
  ngfPlatformWindowManagerFacade
} from 'ngf_framework';

const TAG: string = 'NGFPageWindowSupport';

export class NGFPageWindowName {
  static readonly AGENT_HOME: string = 'pages/ngf/NGFAgentHomePage';
}

class NGFPageWindowStyleFactory {
  private static isDarkMode(): boolean {
    const value = AppStorage.get<boolean>('ngf_is_dark_mode');
    return value === true;
  }

  static buildTransparentDarkTextStyle(): NGFWindowSystemBarStyle {
    const isDark = NGFPageWindowStyleFactory.isDarkMode();
    const contentColor = isDark ? '#FFFFFFFF' : '#0F172A';
    const style = new NGFWindowSystemBarStyle();
    style.enabled = true;
    style.statusBarColor = '#00000000';
    style.navigationBarColor = '#00000000';
    style.statusBarContentColor = contentColor;
    style.navigationBarContentColor = contentColor;
    style.isStatusBarLightIcon = isDark;
    style.isNavigationBarLightIcon = isDark;
    style.enableStatusBarAnimation = true;
    style.enableNavigationBarAnimation = true;
    return style;
  }
}

export class NGFPageWindowSupport {
  private static initialized: boolean = false;

  static loadDynamicTopInset(
    uiCtx: UIContext | undefined,
    baseTitleHeight: number,
    fallbackInset: number,
    callback: (inset: number) => void
  ): void {
    if (!uiCtx) {
      callback(fallbackInset);
      return;
    }
    const hostCtx = uiCtx.getHostContext();
    if (!hostCtx) {
      callback(fallbackInset);
      return;
    }
    window.getLastWindow(hostCtx).then((lastWindow: window.Window): void => {
      const topArea: window.AvoidArea = lastWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      const statusBarHeightVp = uiCtx.px2vp(topArea.topRect.height);
      callback(statusBarHeightVp + baseTitleHeight);
    }).catch((_err: Error): void => {
      callback(fallbackInset);
    });
  }

  static ensureProfilesRegistered(forceRefresh: boolean = false): void {
    if (NGFPageWindowSupport.initialized && !forceRefresh) {
      return;
    }

    const profile = NGFPageWindowSupport.buildProfile(
      NGFPageWindowName.AGENT_HOME,
      NGFDisplayMode.IMMERSIVE_WITH_BARS,
      NGFPageWindowStyleFactory.buildTransparentDarkTextStyle(),
      48
    );
    ngfPlatformWindowManagerFacade.registerPageProfile(profile);

    NGFPageWindowSupport.initialized = true;
    logger.info(TAG, 'registered agent window profile');
  }

  static apply(pageName: string): void {
    NGFPageWindowSupport.ensureProfilesRegistered(true);
    ngfPagePolicyHostFacade.applyPolicy(pageName);
    ngfPagePolicyHostFacade.reapplyPolicy(pageName);
  }

  static restore(pageName: string): void {
    NGFPageWindowSupport.apply(pageName);
  }

  private static buildProfile(
    pageName: string,
    displayMode: NGFDisplayMode,
    style: NGFWindowSystemBarStyle,
    reapplyDelayMs: number
  ): NGFPageWindowProfile {
    return new NGFPageWindowProfile(
      pageName,
      displayMode,
      NGFWindowOrientationPreference.UNSPECIFIED,
      displayMode !== NGFDisplayMode.DEFAULT,
      NGFPageWindowSupport.buildSystemBarPolicy(displayMode, style),
      reapplyDelayMs
    );
  }

  private static buildSystemBarPolicy(
    displayMode: NGFDisplayMode,
    style: NGFWindowSystemBarStyle
  ): NGFWindowSystemBarPolicy {
    switch (displayMode) {
      case NGFDisplayMode.FULL_IMMERSIVE:
        return new NGFWindowSystemBarPolicy(false, false, false, true, style);
      case NGFDisplayMode.STATUS_SAFE_BOTTOM_IMMERSIVE:
        return new NGFWindowSystemBarPolicy(true, false, false, true, style);
      case NGFDisplayMode.IMMERSIVE_WITH_BARS:
      case NGFDisplayMode.DEFAULT:
      default:
        return new NGFWindowSystemBarPolicy(true, true, true, true, style);
    }
  }
}
