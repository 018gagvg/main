import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { tap } from 'rxjs';

@Injectable()
export class ExampleInterceptor1 implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    Sentry.startSpan({ name: 'test-interceptor-span-1' }, () => {});
    return next.handle().pipe(
      tap(() => {
        Sentry.startSpan({ name: 'test-interceptor-span-after-route' }, () => {});
      }),
    );
  }
}
