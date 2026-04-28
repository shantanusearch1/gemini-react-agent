import { useState, useRef } from 'react'

const QUICK_PROMPTS = [
  { label: 'Login page', prompt: 'Login page with email and password fields, remember me checkbox, forgot password link, and sign in button' },
  { label: 'Profile page', prompt: 'User profile page with avatar, name, bio, stats cards for posts/followers/following, and edit profile button' },
  { label: 'Dashboard', prompt: 'Admin dashboard with collapsible sidebar, top nav, 4 stats cards, revenue chart area, and recent orders table' },
  { label: 'Product listing', prompt: 'Product listing page with search bar, category filter chips, sort dropdown, and responsive product card grid with ratings' },
  { label: 'Settings', prompt: 'Settings page with tabs for Account, Notifications, Security, and Billing sections' },
  { label: 'Pricing page', prompt: 'Pricing page with Free, Pro, and Enterprise plan cards, feature list, and CTA buttons' },
  { label: 'File upload', prompt: 'File upload component with drag-and-drop zone, file type icons, file list with size, and remove button' },
  { label: 'Kanban board', prompt: 'Kanban board with Todo, In Progress, Review, and Done columns with task cards showing priority badges' },
  { label: 'Chat UI', prompt: 'Chat interface with message list, sender avatars, timestamps, and message input with send button' },
  { label: 'Register form', prompt: 'Registration form with first name, last name, email, password, confirm password, role dropdown, and terms checkbox' },
  { label: 'Invoice page', prompt: 'Invoice page with company logo, client details, itemized table with qty/rate/total, subtotal, tax, grand total, and print button' },
  { label: 'Landing page', prompt: 'SaaS landing page with hero section, features grid, testimonials, and call-to-action footer' },
]

const PAGE_TYPES = ['Full page', 'Component', 'Dashboard', 'Form', 'Landing page', 'Modal', 'Data table', 'Card list']
const STYLES = ['Modern clean Tailwind CSS', 'Minimal with lots of whitespace', 'shadcn/ui components', 'Dark theme', 'Material design', 'Colorful and bold']
const MODELS = [
  { id: 'google/gemini-2.0-flash-exp:free', label: '🟢 Gemini 2.0 Flash (Free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: '🟢 Llama 3.3 70B (Free)' },
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: '🟢 DeepSeek V3 (Free)' },
  { id: 'mistralai/mistral-7b-instruct:free', label: '🟢 Mistral 7B (Free)' },
  { id: 'google/gemini-2.5-pro-preview', label: '⭐ Gemini 2.5 Pro (Paid)' },
  { id: 'anthropic/claude-sonnet-4-5', label: '⭐ Claude Sonnet (Paid)' },
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }
  return <button onClick={copy} style={styles.copyBtn}>{copied ? '✓ Copied!' : 'Copy'}</button>
}

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_key') || '')
  const [keySet, setKeySet] = useState(!!localStorage.getItem('openrouter_key'))
  const [prompt, setPrompt] = useState('')
  const [pageType, setPageType] = useState('
