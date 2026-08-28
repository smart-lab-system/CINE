'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import { gsap, useGSAP, MOTION, MOTION_OK } from '@/lib/gsap';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const scope = useRef<HTMLDivElement>(null);

  // A timeline rather than a stagger, because the three steps genuinely
  // differ: the mark drops in from above, the card rises and settles from
  // slightly under-scale, then the fields fill in. The position parameters
  // overlap them so the whole sequence is ~450ms end to end and reads as
  // one movement, not three.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        MOTION_OK,
        () => {
          const tl = gsap.timeline({
            defaults: {
              duration: MOTION.enter,
              ease: MOTION.easeOut,
              // Leave no inline transform behind: a lingering matrix on
              // the card would create a stacking context of its own.
              clearProps: 'opacity,visibility,transform',
            },
          });

          tl.from('[data-login-mark]', { autoAlpha: 0, y: -10 })
            .from('[data-login-card]', { autoAlpha: 0, y: 16, scale: 0.98 }, '<0.08')
            .from('[data-login-row]', { autoAlpha: 0, y: 8, stagger: MOTION.stagger }, '<0.12');
        },
        // Scopes the selector text above to this component's subtree.
        scope.current ?? undefined,
      );

      return () => mm.revert();
    },
    { scope },
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
      }),
    });

    if (!response.ok) {
      setError('Sai email hoặc mật khẩu.');
      setPending(false);
      return;
    }

    // The route handler already echoes back the logged-in account (see
    // api/auth/login/route.ts) — read its role instead of sending every
    // role to /admin/*, which is admin-only server-side
    // (AccountsController's @Roles('admin')) and used to 403 for teachers
    // who landed there anyway with no visible explanation. This is a
    // convenience default, not the security boundary — middleware.ts
    // re-checks role from the JWT on every navigation regardless of what
    // this push() targets.
    const body = await response.json().catch(() => null);
    const role = body?.account?.role;
    router.push(role === 'teacher' ? '/teacher/dashboard' : '/admin/dashboard');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Two decorative layers, both behind the content and both muted
          almost to nothing: a ruled grid that fades out downward — an
          answer-sheet reference, which is what this system collects — and
          the same indigo/teal blooms the app shell uses, so signing in
          already looks like the product you're signing into. */}
      <div
        aria-hidden="true"
        className="grid-rule pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_70%)] opacity-60"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(38rem_26rem_at_20%_0%,hsl(var(--primary)/0.12),transparent_65%),radial-gradient(34rem_24rem_at_85%_15%,hsl(var(--accent)/0.14),transparent_65%)]"
      />

      <div ref={scope} className="relative flex w-full max-w-md flex-col items-center gap-8">
        <div data-login-mark className="flex flex-col items-center gap-3 text-center">
          <span className="icon-chip h-14 w-14 bg-gradient-to-br from-primary to-accent text-white shadow-lg">
            <ClipboardCheck className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-h1 text-foreground">ExamCollect</h1>
            <p className="text-body text-muted-foreground">Thu bài &amp; Chấm điểm thông minh</p>
          </div>
        </div>

        <Card data-login-card className="w-full shadow-lg">
          <CardHeader>
            <CardTitle>Đăng nhập</CardTitle>
            <CardDescription>
              Dùng tài khoản do quản trị viên khoa cấp cho bạn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div data-login-row>
                <FormField id="email" label="Email">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="ten.ban@truong.edu.vn"
                    required
                  />
                </FormField>
              </div>

              <div data-login-row>
                <FormField id="password" label="Mật khẩu">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </FormField>
              </div>

              {/* Deliberately vague about which half was wrong: telling a
                  stranger "email đúng, sai mật khẩu" confirms that the
                  address is a real account here. */}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div data-login-row>
                <Button type="submit" size="lg" className="w-full" loading={pending}>
                  {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="flex items-center gap-2 text-small text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Chưa có tài khoản? Liên hệ quản trị viên khoa để được cấp.
        </p>
      </div>
    </main>
  );
}
