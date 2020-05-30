import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass } from '@sentry/types';
import { logger } from '@sentry/utils';
import * as React from 'react';

/** The Props Injected by the HOC */
interface InjectedProps {
  /** Called when a transaction is finished */
  finishProfile(): void;
}

const DEFAULT_DURATION = 30000;

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

const getInitActivity = (componentDisplayName: string, timeout = DEFAULT_DURATION): number | null => {
  const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);

  if (tracingIntegration !== null) {
    // tslint:disable-next-line:no-unsafe-any
    return (tracingIntegration as any).constructor.pushActivity(
      componentDisplayName,
      {
        data: {},
        description: `<${componentDisplayName}>`,
        op: 'react',
      },
      {
        autoPopAfter: timeout,
      },
    );
  }

  logger.warn(`Unable to profile component ${componentDisplayName} due to invalid Tracing Integration`);
  return null;
};

/**
 * withProfiler() is a HOC that leverages the Sentry AM tracing integration to
 * send transactions about a React component.
 * @param WrappedComponent The component profiled
 * @param timeout A maximum timeout for the component render
 */
export const withProfiler = <P extends object>(WrappedComponent: React.ComponentType<P>, timeout?: number) => {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  return class extends React.Component<Omit<P, keyof InjectedProps>, { activity: number | null }> {
    public static displayName: string = `profiler(${componentDisplayName})`;

    public constructor(props: P) {
      super(props);

      this.state = {
        activity: getInitActivity(componentDisplayName, timeout),
      };
    }

    public componentWillUnmount(): void {
      this.finishProfile();
    }

    public finishProfile = () => {
      if (!this.state.activity) {
        return;
      }

      const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
      if (tracingIntegration !== null) {
        // tslint:disable-next-line:no-unsafe-any
        (tracingIntegration as any).constructor.popActivity(this.state.activity);
        this.setState({ activity: null });
      }
    };

    public render(): React.ReactNode {
      return <WrappedComponent {...this.props as P} />;
    }
  };
};
