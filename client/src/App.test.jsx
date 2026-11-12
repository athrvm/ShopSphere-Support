import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import App from './App';
import { queryChatbot } from './services/api';

vi.mock('./services/api', () => ({ queryChatbot: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

test('suggestions send directly, render Markdown, copy and regenerate without history', async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  queryChatbot.mockResolvedValue('A **formatted** answer.\n\n| Item | Days |\n|---|---|\n| Refund | 7 |');
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Ask about returns & refunds' }));
  expect(await screen.findByText('formatted', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(queryChatbot.mock.calls[0][0]).toBe('What is your return and refund policy?');
  await user.click(screen.getByRole('button', { name: 'Copy response' }));
  expect(writeText).toHaveBeenCalled();
  queryChatbot.mockResolvedValue('A regenerated answer');
  await user.click(screen.getByRole('button', { name: 'Regenerate' }));
  expect(await screen.findByText('A regenerated answer')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(queryChatbot.mock.calls[1][0]).toBe(queryChatbot.mock.calls[0][0]);
  expect(screen.getAllByLabelText('You message')).toHaveLength(1);
});

test('Enter sends once, Shift+Enter adds a line, and successful submission clears input', async () => {
  let resolve;
  queryChatbot.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const user = userEvent.setup();
  render(<App />);
  const input = screen.getByRole('textbox', { name: 'Your question' });
  expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
  await user.type(input, 'Delivery{Shift>}{Enter}{/Shift}time?');
  expect(input.value).toBe('Delivery\ntime?');
  await user.keyboard('{Enter}{Enter}');
  expect(queryChatbot).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Waiting for response' })).toBeDisabled();
  await act(async () => resolve('Delivery answer'));
  expect(await screen.findByText('Delivery answer')).toBeInTheDocument();
  await waitFor(() => expect(input).toHaveValue(''));
});

test('errors can be retried without duplicating the question', async () => {
  queryChatbot.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce('Recovered answer');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Ask about exchanges' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Recovered answer')).toBeInTheDocument();
  expect(screen.getAllByLabelText('You message')).toHaveLength(1);
});

test('clear cancels pending requests and prevents a late response from restoring the conversation', async () => {
  let resolve;
  queryChatbot.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Ask about shipping & delivery' }));
  const signal = queryChatbot.mock.calls[0][1].signal;
  await user.click(screen.getByRole('button', { name: 'Clear conversation' }));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve('Late answer'));
  expect(screen.getByRole('heading', { name: 'How can we help you?' })).toBeInTheDocument();
  expect(screen.queryByText('Late answer')).not.toBeInTheDocument();
});

test('theme changes and unsafe HTML is never rendered', async () => {
  queryChatbot.mockResolvedValue('<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  await user.click(screen.getByRole('button', { name: 'Ask about exchanges' }));
  await screen.findByText('Unsafe');
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText('Unsafe').getAttribute('href') || '').not.toMatch(/^javascript:/);
});
