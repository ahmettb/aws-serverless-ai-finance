import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { FIXED_GROUP_CATEGORIES } from '../constants/categories';

/* helpers */
const fmtCurrency = (v) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(v || 0);

const fmtMonth = (iso) => {
    const [y, m] = iso.split('-');
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
};

const toMonthKey = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
};

const shiftMonth = (iso, dir) => {
    const d = new Date(iso + '-01');
    d.setMonth(d.getMonth() + dir);
    return toMonthKey(d);
};

const STATUS_BADGE = {
    paid: { label: 'Ödendi', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: 'check_circle' },
    pending: { label: 'Bekliyor', color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: 'schedule' },
    overdue: { label: 'Gecikmiş', color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: 'error' },
};

const CATEGORY_ICONS = {
    Kira: 'home',
    Fatura: 'receipt_long',
    Abonelik: 'subscriptions',
    Kredi: 'credit_card',
    'Eğitim': 'school',
    'Diğer': 'more_horiz',
};

/* component */
const Expenses = () => {
    const toast = useToast();

    /* state */
    const [month, setMonth] = useState(toMonthKey(new Date()));
    const [groups, setGroups] = useState([]);
    const [stats, setStats] = useState({ total: 0, paid: 0, remaining: 0, count: 0, pending_count: 0 });
    const [loading, setLoading] = useState(true);

    /* dialogs */
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [showItemForm, setShowItemForm] = useState(null);
    const [editGroup, setEditGroup] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [showPaymentForm, setShowPaymentForm] = useState(null); // item object
    const [expandedHistory, setExpandedHistory] = useState({}); // { itemId: true }

    /* forms */
    const [groupForm, setGroupForm] = useState({ title: '', category_type: FIXED_GROUP_CATEGORIES[0] });
    const [itemForm, setItemForm] = useState({ name: '', amount: '', day: '1' });
    const [paymentForm, setPaymentForm] = useState({ payment_date: new Date().toISOString().split('T')[0], amount: '', note: '' });

    /* fetch */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchData(); }, [month]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.getFixedExpenses(month);
            setGroups(res.data || []);
            setStats(res.stats || { total: 0, paid: 0, remaining: 0, count: 0, pending_count: 0 });
        } catch (err) {
            toast.show.error('Sabit giderler yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    /* group CRUD */
    const handleGroupSubmit = async (e) => {
        e.preventDefault();
        const title = groupForm.title.trim();
        if (!title) { toast.show.warning('Grup adı gerekli'); return; }

        try {
            if (editGroup) {
                await api.updateFixedExpenseGroup(editGroup.id, groupForm);
                toast.show.success('Grup güncellendi');
            } else {
                await api.createFixedExpenseGroup(groupForm);
                toast.show.success('Yeni grup oluşturuldu');
            }
            resetGroupForm();
            fetchData();
        } catch {
            toast.show.error(editGroup ? 'Güncelleme başarısız' : 'Oluşturma başarısız');
        }
    };

    const resetGroupForm = () => {
        setShowGroupForm(false);
        setEditGroup(null);
        setGroupForm({ title: '', category_type: FIXED_GROUP_CATEGORIES[0] });
    };

    const openEditGroup = (g) => {
        setEditGroup(g);
        setGroupForm({ title: g.title, category_type: g.category_type || FIXED_GROUP_CATEGORIES[0] });
        setShowGroupForm(true);
    };

    /* item CRUD */
    const handleItemSubmit = async (e) => {
        e.preventDefault();
        const name = itemForm.name.trim();
        const amount = parseFloat(itemForm.amount);
        const day = parseInt(itemForm.day, 10);

        if (!name) { toast.show.warning('Kalem adı gerekli'); return; }
        if (isNaN(day) || day < 1 || day > 31) { toast.show.warning('Gün 1-31 arasında olmalı'); return; }
        const finalAmount = (!itemForm.amount && itemForm.amount !== 0) || isNaN(amount) ? 0 : Math.max(0, amount);

        try {
            if (editItem) {
                await api.updateFixedExpenseItem(editItem.id, { name, amount: finalAmount, day });
                toast.show.success('Kalem güncellendi');
            } else {
                await api.addFixedExpenseItem({ group_id: showItemForm, name, amount: finalAmount, day });
                toast.show.success('Kalem eklendi');
            }
            resetItemForm();
            fetchData();
        } catch {
            toast.show.error('İşlem başarısız');
        }
    };

    const resetItemForm = () => {
        setShowItemForm(null);
        setEditItem(null);
        setItemForm({ name: '', amount: '', day: '1' });
    };

    const openEditItem = (item, groupId) => {
        setEditItem(item);
        setShowItemForm(groupId);
        setItemForm({ name: item.name, amount: String(item.amount), day: String(item.day) });
    };

    /* payment toggle */
    const handlePaymentToggle = async (item) => {
        const newStatus = item.status === 'paid' ? 'pending' : 'paid';
        try {
            await api.saveFixedExpensePayment(item.id, { status: newStatus, month });
            fetchData();
            toast.show.success(newStatus === 'paid' ? 'Ödendi olarak işaretlendi' : 'Bekliyora çevrildi');
        } catch {
            toast.show.error('Durum güncellenemedi');
        }
    };

    /* payment record */
    const openPaymentForm = (item) => {
        setShowPaymentForm(item);
        setPaymentForm({ payment_date: new Date().toISOString().split('T')[0], amount: String(item.amount || ''), note: '' });
    };

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        if (!showPaymentForm) return;
        const amount = parseFloat(paymentForm.amount);
        if (isNaN(amount) || amount <= 0) { toast.show.warning('Geçerli bir tutar giriniz'); return; }

        try {
            await api.saveFixedExpensePayment(showPaymentForm.id, {
                status: 'paid',
                payment_date: paymentForm.payment_date,
                amount,
                note: paymentForm.note.trim()
            });
            toast.show.success('Ödeme kaydedildi');
            setShowPaymentForm(null);
            fetchData();
        } catch {
            toast.show.error('Ödeme kaydedilemedi');
        }
    };

    const toggleHistory = (itemId) => {
        setExpandedHistory(prev => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    /* delete */
    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        try {
            if (deleteTarget.type === 'group') {
                await api.deleteFixedExpenseGroup(deleteTarget.id);
            } else {
                await api.deleteFixedExpenseItem(deleteTarget.id);
            }
            toast.show.success(`${deleteTarget.label} silindi`);
            fetchData();
        } catch {
            toast.show.error('Silme başarısız');
        } finally {
            setDeleteTarget(null);
        }
    };

    /* derived */
    const paidPct = useMemo(() => (stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0), [stats]);
    const isCurrentMonth = month === toMonthKey(new Date());

    /* render */
    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <ConfirmDialog
                isOpen={!!deleteTarget}
                title={deleteTarget?.type === 'group' ? 'Grubu Sil' : 'Kalemi Sil'}
                message={`"${deleteTarget?.label || ''}" silinecek. Bu işlem geri alınamaz.`}
                confirmText="Evet, Sil"
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteTarget(null)}
                type="danger"
            />

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Gider Yönetimi</h1>
                    <p className="text-slate-500 text-sm mt-1">Sabit giderlerinizi gruplar halinde takip edin.</p>
                </div>
                <button
                    onClick={() => { resetGroupForm(); setShowGroupForm(true); }}
                    className="bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-slate-200 dark:shadow-none transition-all"
                >
                    <span className="material-icons-round text-lg">add</span>
                    Yeni Grup
                </button>
            </div>

            {/* Month Nav */}
            <div className="flex items-center justify-between mb-6 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-icons-round text-slate-600 dark:text-slate-400">chevron_left</span>
                </button>
                <div className="text-center">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{fmtMonth(month)}</h2>
                    {isCurrentMonth && <span className="text-xs text-indigo-600 font-medium">Bu Ay</span>}
                </div>
                <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="material-icons-round text-slate-600 dark:text-slate-400">chevron_right</span>
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Toplam Gider</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{fmtCurrency(stats.total)}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Ödenen</p>
                    <p className="text-xl font-bold text-emerald-600">{fmtCurrency(stats.paid)}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Kalan</p>
                    <p className="text-xl font-bold text-amber-600">{fmtCurrency(stats.remaining)}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Tamamlanma</p>
                    <div className="flex items-center gap-2">
                        <p className="text-xl font-bold text-slate-900 dark:text-white">%{paidPct}</p>
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${paidPct}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Group Form Dialog */}
            {showGroupForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => resetGroupForm()}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-in" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="material-icons-round text-indigo-600">{editGroup ? 'edit' : 'create_new_folder'}</span>
                            {editGroup ? 'Grubu Düzenle' : 'Yeni Gider Grubu'}
                        </h3>
                        <form onSubmit={handleGroupSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Grup Adı</label>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Örn: Ev Giderleri"
                                    value={groupForm.title}
                                    onChange={e => setGroupForm({ ...groupForm, title: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kategori</label>
                                <select
                                    value={groupForm.category_type}
                                    onChange={e => setGroupForm({ ...groupForm, category_type: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                                >
                                    {FIXED_GROUP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={resetGroupForm} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    İptal
                                </button>
                                <button type="submit" className="flex-1 py-2.5 rounded-xl font-bold bg-slate-900 dark:bg-indigo-600 text-white hover:bg-slate-800 dark:hover:bg-indigo-700 transition-colors shadow-lg">
                                    {editGroup ? 'Güncelle' : 'Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Item Form Dialog */}
            {showItemForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => resetItemForm()}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-in" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="material-icons-round text-indigo-600">{editItem ? 'edit' : 'add_circle'}</span>
                            {editItem ? 'Kalemi Düzenle' : 'Yeni Gider Kalemi'}
                        </h3>
                        <form onSubmit={handleItemSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kalem Adı</label>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Örn: Elektrik Faturası"
                                    value={itemForm.name}
                                    onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tutar (TL) <span className="normal-case text-slate-400 font-normal">- isteğe bağlı</span></label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Bilinmiyorsa boş bırakın"
                                        value={itemForm.amount}
                                        onChange={e => setItemForm({ ...itemForm, amount: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ödeme Günü</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={itemForm.day}
                                        onChange={e => setItemForm({ ...itemForm, day: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={resetItemForm} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    İptal
                                </button>
                                <button type="submit" className="flex-1 py-2.5 rounded-xl font-bold bg-slate-900 dark:bg-indigo-600 text-white hover:bg-slate-800 dark:hover:bg-indigo-700 transition-colors shadow-lg">
                                    {editItem ? 'Güncelle' : 'Ekle'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Record Form Dialog */}
            {showPaymentForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowPaymentForm(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-in" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                            <span className="material-icons-round text-emerald-600">payments</span>
                            Ödeme Kaydı Ekle
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                            <span className="font-bold text-slate-700 dark:text-slate-300">{showPaymentForm.name}</span> için ödeme bilgisi girin.
                        </p>
                        <form onSubmit={handlePaymentSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ödeme Tarihi</label>
                                    <input
                                        autoFocus
                                        type="date"
                                        value={paymentForm.payment_date}
                                        onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tutar (TL)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        value={paymentForm.amount}
                                        onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-bold"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Not (Opsiyonel)</label>
                                <input
                                    type="text"
                                    placeholder="Örn: Banka havalesi ile ödendi"
                                    value={paymentForm.note}
                                    onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium"
                                    maxLength={280}
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowPaymentForm(null)} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    İptal
                                </button>
                                <button type="submit" className="flex-1 py-2.5 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 dark:shadow-none flex items-center justify-center gap-2">
                                    <span className="material-icons-round text-sm">check</span>
                                    Ödemeyi Kaydet
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Groups & Items */}
            {groups.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 flex flex-col items-center text-center">
                    <span className="material-icons-round text-5xl text-slate-200 dark:text-slate-700 mb-4">account_balance</span>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Henüz sabit gider grubu yok</h3>
                    <p className="text-sm text-slate-500 mb-6 max-w-sm">Kira, fatura ve abonelik gibi düzenli giderlerinizi gruplar halinde takip etmeye başlayın.</p>
                    <button
                        onClick={() => { resetGroupForm(); setShowGroupForm(true); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
                    >
                        <span className="material-icons-round text-lg">add</span>
                        İlk Grubu Oluştur
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {groups.map(group => {
                        const groupPaid = (group.items || []).filter(i => i.status === 'paid').length;
                        const groupTotal = (group.items || []).length;
                        const catIcon = CATEGORY_ICONS[group.category_type] || 'folder';

                        return (
                            <div key={group.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                {/* Group Header */}
                                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                            <span className="material-icons-round text-indigo-600 dark:text-indigo-400">{catIcon}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">{group.title}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400 font-medium">{group.category_type}</span>
                                                <span className="text-xs text-slate-300 dark:text-slate-600">|</span>
                                                <span className="text-xs text-slate-400">{groupPaid}/{groupTotal} ödendi</span>
                                                {group.total_amount > 0 && (
                                                    <>
                                                        <span className="text-xs text-slate-300 dark:text-slate-600">|</span>
                                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{fmtCurrency(group.total_amount)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => { resetItemForm(); setShowItemForm(group.id); }}
                                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                                            title="Kalem Ekle"
                                        >
                                            <span className="material-icons-round text-lg">add_circle_outline</span>
                                        </button>
                                        <button
                                            onClick={() => openEditGroup(group)}
                                            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                                            title="Düzenle"
                                        >
                                            <span className="material-icons-round text-lg">edit</span>
                                        </button>
                                        <button
                                            onClick={() => setDeleteTarget({ type: 'group', id: group.id, label: group.title })}
                                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                            title="Sil"
                                        >
                                            <span className="material-icons-round text-lg">delete_outline</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Items */}
                                {(!group.items || group.items.length === 0) ? (
                                    <div className="p-8 text-center text-slate-400">
                                        <span className="material-icons-round text-3xl opacity-20 mb-2 block">inbox</span>
                                        <p className="text-sm">Bu grupta henüz kalem yok.</p>
                                        <button
                                            onClick={() => { resetItemForm(); setShowItemForm(group.id); }}
                                            className="mt-3 text-indigo-600 hover:text-indigo-700 text-sm font-bold inline-flex items-center gap-1"
                                        >
                                            <span className="material-icons-round text-sm">add</span>
                                            Kalem Ekle
                                        </button>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                        {group.items.map(item => {
                                            const sb = STATUS_BADGE[item.status] || STATUS_BADGE.pending;
                                            return (
                                                <div key={item.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group/item">
                                                    <div className="flex items-center gap-4">
                                                        {/* Payment Toggle */}
                                                        <button
                                                            onClick={() => handlePaymentToggle(item)}
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${item.status === 'paid'
                                                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 hover:bg-emerald-50 hover:text-emerald-500'
                                                                }`}
                                                            title={item.status === 'paid' ? 'Bekliyora çevir' : 'Ödendi olarak işaretle'}
                                                        >
                                                            <span className="material-icons-round text-lg">
                                                                {item.status === 'paid' ? 'check' : 'radio_button_unchecked'}
                                                            </span>
                                                        </button>

                                                        {/* Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className={`font-bold text-sm ${item.status === 'paid' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                                                                    {item.name}
                                                                </p>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sb.color}`}>
                                                                    {sb.label}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-400 mt-0.5">
                                                                Her ayın {item.day}. günü
                                                                {item.month_payment?.payment_date && ` — Son ödeme: ${new Date(item.month_payment.payment_date).toLocaleDateString('tr-TR')}`}
                                                            </p>
                                                        </div>

                                                        {/* Amount */}
                                                        <p className={`font-bold text-sm flex-shrink-0 ${item.status === 'paid' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                                                            {fmtCurrency(item.amount)}
                                                        </p>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0">
                                                            <button
                                                                onClick={() => openPaymentForm(item)}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                                                                title="Ödeme Kaydı Ekle"
                                                            >
                                                                <span className="material-icons-round text-base">add_card</span>
                                                            </button>
                                                            <button
                                                                onClick={() => openEditItem(item, group.id)}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                                                                title="Düzenle"
                                                            >
                                                                <span className="material-icons-round text-base">edit</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteTarget({ type: 'item', id: item.id, label: item.name })}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                                title="Sil"
                                                            >
                                                                <span className="material-icons-round text-base">delete_outline</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Payment History */}
                                                    {item.history && item.history.length > 0 && (
                                                        <div className="ml-12 mt-2">
                                                            <button
                                                                onClick={() => toggleHistory(item.id)}
                                                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors mb-1.5"
                                                            >
                                                                <span className="material-icons-round text-sm" style={{ transition: 'transform 0.2s', transform: expandedHistory[item.id] ? 'rotate(90deg)' : 'rotate(0deg)' }}>chevron_right</span>
                                                                <span className="font-bold">Ödeme Geçmişi ({item.history.length})</span>
                                                            </button>

                                                            {/* Collapsed: mini badge view */}
                                                            {!expandedHistory[item.id] && (
                                                                <div className="flex items-center gap-1 flex-wrap">
                                                                    {item.history.slice(0, 6).map((h, idx) => (
                                                                        <span
                                                                            key={idx}
                                                                            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${h.status === 'paid'
                                                                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                                                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                                                                }`}
                                                                            title={`${new Date(h.date).toLocaleDateString('tr-TR')} — ${fmtCurrency(h.amount)}${h.note ? ' — ' + h.note : ''}`}
                                                                        >
                                                                            {new Date(h.date).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })}
                                                                        </span>
                                                                    ))}
                                                                    {item.history.length > 6 && (
                                                                        <span className="text-[9px] text-slate-400 font-medium">+{item.history.length - 6}</span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Expanded: full timeline */}
                                                            {expandedHistory[item.id] && (
                                                                <div className="relative pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-2 mt-1">
                                                                    {item.history.map((h, idx) => (
                                                                        <div key={idx} className="relative">
                                                                            <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${h.status === 'paid' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                                                    {new Date(h.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                                                </span>
                                                                                <span className={`text-xs font-bold ${h.status === 'paid' ? 'text-emerald-600' : 'text-amber-500'}`}>
                                                                                    {fmtCurrency(h.amount)}
                                                                                </span>
                                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${h.status === 'paid'
                                                                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                                                    : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                                                                                    }`}>
                                                                                    {h.status === 'paid' ? 'Ödendi' : 'Bekliyor'}
                                                                                </span>
                                                                            </div>
                                                                            {h.note && (
                                                                                <p className="text-[10px] text-slate-400 mt-0.5 italic">💬 {h.note}</p>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* No history yet - subtle link */}
                                                    {(!item.history || item.history.length === 0) && (
                                                        <div className="ml-12 mt-1">
                                                            <button
                                                                onClick={() => openPaymentForm(item)}
                                                                className="text-[10px] text-slate-300 hover:text-emerald-500 transition-colors flex items-center gap-1"
                                                            >
                                                                <span className="material-icons-round text-xs">add_circle_outline</span>
                                                                İlk ödeme kaydını ekle
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </DashboardLayout>
    );
};

export default Expenses;
