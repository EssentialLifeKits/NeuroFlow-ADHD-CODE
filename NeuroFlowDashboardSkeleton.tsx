import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    Pressable,
    TextInput,
    Modal,
    Animated,
    Dimensions,
    SafeAreaView,
    StatusBar,
    StyleSheet
} from 'react-native';

const { width } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(width * 0.8, 300);

export default function NeuroFlowDashboard() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

    const toggleSidebar = () => {
        if (isSidebarOpen) {
            Animated.timing(slideAnim, {
                toValue: -SIDEBAR_WIDTH,
                duration: 250,
                useNativeDriver: true,
            }).start(() => setIsSidebarOpen(false));
        } else {
            setIsSidebarOpen(true);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start();
        }
    };

    const closeSidebar = () => {
        if (isSidebarOpen) toggleSidebar();
    };

    // Mock Calendar Data
    const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const calendarDays = Array.from({ length: 14 }, (_, i) => i + 1);

    return (
        <SafeAreaView className="flex-1 bg-[#0a0a0f]">
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

            {/* --- MOBILE HEADER --- */}
            <View className="flex-row items-center justify-between px-4 h-16 bg-[#0a0a0f]/95 border-b border-[rgba(255,255,255,0.06)] z-10 w-full">
                <Pressable className="p-2 -ml-2 rounded-lg active:bg-[#16161f]" onPress={toggleSidebar}>
                    {/* Hamburger Icon */}
                    <View className="w-5 h-[2px] bg-[#f0f0f5] mb-[5px] rounded-full" />
                    <View className="w-5 h-[2px] bg-[#f0f0f5] mb-[5px] rounded-full" />
                    <View className="w-5 h-[2px] bg-[#f0f0f5] rounded-full" />
                </Pressable>

                <View className="flex-row items-center gap-2">
                    {/* Logo Placeholder */}
                    <View className="w-6 h-6 rounded bg-gradient-to-tr from-[#F58529] to-[#8134AF] opacity-80" />
                    <Text className="text-[#f0f0f5] font-extrabold text-lg tracking-tight">NeuroFlow</Text>
                </View>

                <Pressable className="px-3 py-1.5 bg-[#16161f] border border-[rgba(255,255,255,0.06)] rounded-full active:border-[#DD2A7B]">
                    <Text className="text-[#8b8b9e] text-xs font-medium">Today</Text>
                </Pressable>
            </View>

            {/* --- MAIN SCROLLABLE CONTENT --- */}
            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>

                {/* Top Action Bar */}
                <View className="px-4 pt-6 pb-4 flex-col gap-4">
                    <View>
                        <Text className="text-2xl font-extrabold text-[#f0f0f5] tracking-tight">Content Calendar</Text>
                        <Text className="text-[#8b8b9e] text-sm mt-1">Manage your weekly focus</Text>
                    </View>
                    <Pressable
                        onPress={() => setIsModalVisible(true)}
                        className="flex-row items-center justify-center gap-2 py-3 bg-[#DD2A7B] rounded-xl shadow-lg shadow-[#DD2A7B]/30 active:scale-95"
                    >
                        <Text className="text-white text-sm font-bold">+ New Task / Post</Text>
                    </Pressable>
                </View>

                {/* --- CALENDAR GRID STRUCTURE (Mobile Stacking) --- */}
                <View className="bg-[#16161f] border border-[rgba(255,255,255,0.06)] rounded-2xl mx-4 overflow-hidden shadow-md shadow-black/40">
                    {/* Calendar Header */}
                    <View className="flex-row border-b border-[rgba(255,255,255,0.06)]">
                        {weekDays.map((day) => (
                            <View key={day} className="flex-1 py-3 items-center">
                                <Text className="text-[#5c5c72] text-[10px] font-bold tracking-widest">{day}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Calendar Body (2 Weeks Mock) */}
                    <View className="flex-row flex-wrap">
                        {calendarDays.map((date, index) => {
                            const isToday = date === 8;
                            return (
                                <Pressable
                                    key={index}
                                    className={`w-[14.28%] min-h-[75px] border-r border-b border-[rgba(255,255,255,0.06)] p-1 active:bg-[#1c1c28] ${isToday ? 'bg-[#DD2A7B]/5' : 'bg-[#16161f]'}`}
                                >
                                    {/* Calendar Horizontal Color Bars (.cal-post-bars logic) */}
                                    <View className="flex-row gap-[2px] mb-1">
                                        {/* Render color bars conditionally based on tasks/events */}
                                        {index % 3 === 0 && <View className="flex-1 h-1 rounded flex-shrink bg-[#FEDA75] opacity-90" />}
                                        {index % 4 === 0 && <View className="flex-1 h-1 rounded flex-shrink bg-[#34D399] opacity-90" />}
                                        {index % 5 === 0 && <View className="flex-1 h-1 rounded flex-shrink bg-[#F87171] opacity-90" />}
                                    </View>

                                    <View className={`self-center w-6 h-6 rounded-full items-center justify-center mb-1 ${isToday ? 'bg-[#DD2A7B]' : ''}`}>
                                        <Text className={`text-[11px] font-semibold ${isToday ? 'text-white' : 'text-[#8b8b9e]'}`}>{date}</Text>
                                    </View>

                                    {/* Text indicators as fallback */}
                                    {index % 3 === 0 && <Text className="text-[8px] text-[#FEDA75] font-medium leading-tight truncate px-0.5">Focus</Text>}
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* --- WIDGETS COLUMN (Mobile Stacking: No side-by-side) --- */}
                <View className="flex-col gap-5 mt-6 px-4">

                    {/* Upcoming Posts / Tasks Widget */}
                    <View className="bg-[#16161f] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5 shadow-lg shadow-black/40">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-[#f0f0f5] text-base font-bold">Upcoming Priorities</Text>
                        </View>
                        <View className="flex-col gap-3">
                            {[1, 2].map((i) => (
                                <Pressable key={i} className="flex-row items-center gap-3 p-3 bg-[#1e1e2a] rounded-xl active:bg-[#1c1c28]">
                                    <View className="w-10 h-10 rounded-lg bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] items-center justify-center">
                                        <View className="w-4 h-4 rounded-sm bg-[#60A5FA]/20 border border-[#60A5FA]" />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-[#f0f0f5] text-sm font-semibold truncate">Morning Review Session</Text>
                                        <Text className="text-[#8b8b9e] text-[11px] mt-0.5">Today • 9:00 AM</Text>
                                    </View>
                                    <View className="px-2 py-1 rounded-full bg-[#60A5FA]/10">
                                        <Text className="text-[#60A5FA] text-[10px] font-bold">FOCUS</Text>
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {/* Hero CTA Card (Vertically Stacked) */}
                    <View className="bg-[#1e1e2a] border border-[#DD2A7B]/20 rounded-2xl p-6 overflow-hidden relative shadow-lg shadow-[#DD2A7B]/10">
                        {/* Glow background effect */}
                        <View className="absolute -top-[50%] -right-[20%] w-[200px] h-[200px] bg-[#DD2A7B] opacity-[0.08] rounded-full blur-3xl z-0" />

                        <View className="relative z-10">
                            <Text className="text-xl font-extrabold text-[#f0f0f5] mb-2 tracking-tight">🚀 Supercharge Routine</Text>
                            <Text className="text-[#8b8b9e] text-sm mb-5 leading-relaxed">
                                Stop leaving focus on the table. Automate your daily routines and ADHD strategy inside one view.
                            </Text>
                            <Pressable className="py-3 px-6 bg-gradient-to-r bg-[#8134AF] rounded-full self-start items-center shadow-lg active:scale-95">
                                <Text className="text-white font-bold text-sm">Explore Automations</Text>
                            </Pressable>
                            <Text className="text-[#5c5c72] text-[10px] mt-4 font-medium uppercase tracking-wider">Powered by NeuroFlow</Text>
                        </View>
                    </View>

                </View>
            </ScrollView>

            {/* --- SIDEBAR HAMBURGER SLIDE OUT --- */}
            {isSidebarOpen && (
                <Pressable
                    className="absolute inset-0 bg-black/60 z-40"
                    onPress={closeSidebar}
                >
                    <Animated.View style={{ opacity: 1 /* can interpolate fade */ }} className="flex-1" />
                </Pressable>
            )}

            <Animated.View
                style={{ transform: [{ translateX: slideAnim }] }}
                className="absolute top-0 bottom-0 left-0 bg-[#12121a] border-r border-[rgba(255,255,255,0.06)] z-50 flex-col pt-safe shadow-2xl shadow-black h-full"
                width={SIDEBAR_WIDTH}
            >
                <View className="flex-row items-center gap-3 p-6 border-b border-[rgba(255,255,255,0.06)] mt-8">
                    <View className="w-8 h-8 rounded bg-[#DD2A7B] opacity-80" />
                    <Text className="text-white text-xl font-extrabold tracking-tight">NeuroFlow</Text>
                </View>

                <ScrollView className="flex-1 px-4 py-6">
                    <View className="flex-col gap-2">
                        {/* Active Nav Item */}
                        <Pressable className="flex-row items-center gap-3 px-4 py-3 bg-[#DD2A7B]/10 rounded-xl border-l-[3px] border-[#DD2A7B]">
                            <Text className="text-[#f0f0f5] text-sm font-semibold">Calendar</Text>
                        </Pressable>
                        {/* Inactive Nav Items */}
                        <Pressable className="flex-row items-center gap-3 px-4 py-3 rounded-xl active:bg-[#16161f]">
                            <Text className="text-[#8b8b9e] text-sm font-medium">Performance Analytics</Text>
                        </Pressable>
                        <Pressable className="flex-row items-center gap-3 px-4 py-3 rounded-xl active:bg-[#16161f]">
                            <Text className="text-[#8b8b9e] text-sm font-medium">Resources</Text>
                        </Pressable>
                    </View>
                </ScrollView>

                <View className="p-4 border-t border-[rgba(255,255,255,0.06)] mb-8">
                    <View className="flex-row items-center gap-3 p-2">
                        <View className="w-9 h-9 rounded-full bg-[#1e1e2a] items-center justify-center border border-[rgba(255,255,255,0.06)]">
                            <Text className="text-[#f0f0f5] text-[10px] font-bold">ELK</Text>
                        </View>
                        <View>
                            <Text className="text-[#f0f0f5] text-[11px] font-bold tracking-wider">ESSENTIAL LIFE KITS</Text>
                            <Text className="text-[#8b8b9e] text-[10px] mt-0.5">Pro Plan</Text>
                        </View>
                    </View>
                </View>
            </Animated.View>

            {/* --- SUPER POWER MODAL (Schedule New Post) --- */}
            <Modal visible={isModalVisible} animationType="slide" transparent>
                <View className="flex-1 bg-black/70 justify-end">
                    <View className="bg-[#12121a] rounded-t-3xl pt-6 px-5 pb-10 mt-16 border-t border-[rgba(255,255,255,0.06)] max-h-[90%] shadow-2xl shadow-black">

                        {/* Modal Header */}
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-[#f0f0f5] text-lg font-bold">Schedule New Post</Text>
                            <Pressable
                                onPress={() => setIsModalVisible(false)}
                                className="w-8 h-8 rounded-lg items-center justify-center bg-[#1a1a26] border border-[rgba(255,255,255,0.06)] active:bg-[#1e1e2a]"
                            >
                                <Text className="text-[#8b8b9e] text-sm font-bold">×</Text>
                            </Pressable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                            {/* Upload Zone / Sticker Assigner (9:16 portrait) */}
                            <Pressable className="aspect-[9/16] w-full max-h-[250px] border-2 border-dashed border-[rgba(255,255,255,0.06)] hover:border-[#DD2A7B] rounded-xl items-center justify-center bg-[#1a1a26] mb-6 active:bg-[#1e1e2a]">
                                <View className="items-center justify-center px-6">
                                    <View className="w-12 h-12 rounded-full bg-[#16161f] border border-[rgba(255,255,255,0.06)] mb-3 items-center justify-center">
                                        <Text className="text-[#8b8b9e] font-bold">+</Text>
                                    </View>
                                    <Text className="text-[#f0f0f5] font-semibold text-sm mb-1">Upload Sticker or Media</Text>
                                    <Text className="text-[#5c5c72] text-[11px] text-center">9:16 Portrait Assigner (1080×1920)</Text>
                                </View>
                            </Pressable>

                            {/* Task Title / Caption Input */}
                            <View className="mb-5">
                                <Text className="text-[#8b8b9e] text-xs font-bold mb-2 uppercase tracking-wider">Task Title</Text>
                                <TextInput
                                    className="bg-[#1a1a26] border border-[rgba(255,255,255,0.06)] rounded-xl px-4 py-3.5 text-[#f0f0f5] text-sm font-medium"
                                    placeholderTextColor="#5c5c72"
                                    placeholder="E.g., Complete UI skeleton review..."
                                    multiline
                                />
                            </View>

                            {/* Category Selection (Post Types) */}
                            <View className="mb-6">
                                <Text className="text-[#8b8b9e] text-xs font-bold mb-2 uppercase tracking-wider">Category</Text>
                                <View className="flex-row flex-wrap gap-2">
                                    {[
                                        { label: 'Post', color: '#FEDA75' },
                                        { label: 'Story', color: '#34D399' },
                                        { label: 'Reel', color: '#F87171' },
                                        { label: 'Carousel', color: '#60A5FA' }
                                    ].map((type, idx) => (
                                        <Pressable
                                            key={idx}
                                            className={`px-4 py-2.5 bg-[#1a1a26] border border-[rgba(255,255,255,0.06)] rounded-lg active:border-[${type.color}] flex-row items-center gap-2`}
                                        >
                                            <View className={`w-2 h-2 rounded-full`} style={{ backgroundColor: type.color }} />
                                            <Text className="text-[#8b8b9e] text-xs font-semibold">{type.label}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>

                            <View className="flex-row gap-3 pt-4 border-t border-[rgba(255,255,255,0.06)]">
                                <Pressable
                                    onPress={() => setIsModalVisible(false)}
                                    className="flex-1 py-3.5 bg-[#16161f] border border-[rgba(255,255,255,0.06)] rounded-full items-center active:bg-[#1a1a26]"
                                >
                                    <Text className="text-[#8b8b9e] font-bold text-sm">Cancel</Text>
                                </Pressable>
                                <Pressable className="flex-1 py-3.5 bg-[#DD2A7B] rounded-full items-center shadow-lg shadow-[#DD2A7B]/30 active:scale-95">
                                    <Text className="text-white font-bold text-sm">Save to Calendar</Text>
                                </Pressable>
                            </View>

                        </ScrollView>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}
