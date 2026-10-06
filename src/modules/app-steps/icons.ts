/**
 * Iconos de las pantallas de la app y de las tarjetas de los pasos (Lucide, ISC: trazo fino, como los Phosphor de la
 * app). Solo los trazos internos; el <svg> lo pone quien los usa (stroke = currentColor).
 */
import {
  QrCode, Users, Share2, Calendar, Repeat, MapPin, Building2, Phone, Mail, Image, BadgeCheck, Link, Anchor, Headset,
  Check, Clock, Ruler, Send, BookOpen, ShieldCheck, ChartLine, Megaphone, Globe, Heart, Star, Sparkles, Thermometer,
  ArrowDown, Fish, Smartphone, ChevronLeft, ChevronRight, ChevronDown, CircleCheck, Info, Lightbulb, CirclePlus, House,
  User, Download, Pencil, ClipboardList, Eye, Menu, ArrowRight, Waves, Camera, Ellipsis, Search, StickyNote, Plus,
  LayoutGrid, List, Award, Share, ImagePlus, History, UserRound, Images,
} from 'lucide-static';

const inner = (svg: string) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

export const APP_ICONS = {
  qr: inner(QrCode), users: inner(Users), share: inner(Share2), calendar: inner(Calendar), repeat: inner(Repeat),
  pin: inner(MapPin), building: inner(Building2), phone: inner(Phone), mail: inner(Mail), image: inner(Image),
  logo: inner(BadgeCheck), link: inner(Link), anchor: inner(Anchor), headset: inner(Headset), check: inner(Check),
  clock: inner(Clock), ruler: inner(Ruler), send: inner(Send), book: inner(BookOpen), shield: inner(ShieldCheck),
  chart: inner(ChartLine), megaphone: inner(Megaphone), globe: inner(Globe), heart: inner(Heart), star: inner(Star),
  sparkle: inner(Sparkles), thermo: inner(Thermometer), down: inner(ArrowDown), fish: inner(Fish), mobile: inner(Smartphone),
  back: inner(ChevronLeft), next: inner(ChevronRight), caret: inner(ChevronDown), ok: inner(CircleCheck), info: inner(Info),
  bulb: inner(Lightbulb), add: inner(CirclePlus), home: inner(House), user: inner(User), download: inner(Download),
  edit: inner(Pencil), clipboard: inner(ClipboardList), eye: inner(Eye), menu: inner(Menu), arrow: inner(ArrowRight),
  waves: inner(Waves), camera: inner(Camera), more: inner(Ellipsis), search: inner(Search), note: inner(StickyNote), plus: inner(Plus),
  grid: inner(LayoutGrid), list: inner(List), award: inner(Award), export: inner(Share), imageAdd: inner(ImagePlus),
  history: inner(History), person: inner(UserRound), images: inner(Images),
} as const;

export type AppIcon = keyof typeof APP_ICONS;

/** Máscara de buceo (la de las tarjetas de inmersión de la app; no está en Lucide). */
export const MASK_ICON = '<path d="M3 9.5c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3v1.8c0 2-1.6 3.7-3.7 3.7h-1.6c-1 0-1.8-.6-2.2-1.4l-.3-.7a1.3 1.3 0 0 0-2.4 0l-.3.7c-.4.8-1.2 1.4-2.2 1.4H6.7C4.6 15 3 13.3 3 11.3z"/><path d="M21 6v8.5a5 5 0 0 1-5 5h-1.5"/>';
