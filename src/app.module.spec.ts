import { AppModule } from './app.module.js';

describe('AppModule', () => {
  it('returns its module name', () => {
    expect(new AppModule().getName()).toBe('AppModule');
  });
});
