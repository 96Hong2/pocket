import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import HomePage from '../../pages/HomePage';
import NotFoundPage from '../../pages/NotFoundPage';
import { AppShell } from '../AppShell';
import { BackHandler } from '../BackHandler';

import { DemoGallery } from './demoRoute';
import { DEMO_PATH, RECORD_QUERY, ROUTES } from './routes';

// 홈은 첫 화면이라 쪼개지 않는다. 나머지는 진입할 때 받는다.
const ReportPage = lazy(() => import('../../pages/ReportPage'));
const ManagePage = lazy(() => import('../../pages/ManagePage'));
const CalendarPage = lazy(() => import('../../pages/CalendarPage'));
const GoalPage = lazy(() => import('../../pages/GoalPage'));
const AssetsPage = lazy(() => import('../../pages/AssetsPage'));
const CategoriesPage = lazy(() => import('../../pages/CategoriesPage'));
const TagsPage = lazy(() => import('../../pages/TagsPage'));
const RecurringPage = lazy(() => import('../../pages/RecurringPage'));
const SettingsPage = lazy(() => import('../../pages/SettingsPage'));
const PrivacyPage = lazy(() => import('../../pages/PrivacyPage'));
const NotificationSettingsPage = lazy(() => import('../../pages/NotificationSettingsPage'));
const AccountPage = lazy(() => import('../../pages/AccountPage'));

export function AppRouter() {
  return (
    <BrowserRouter>
      <BackHandler />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          {/* 주소만 받아 홈으로 넘긴다. 뒤로가기를 누르면 홈이 아니라 미니앱이 닫혀야 해서 바꿔 끼운다. */}
          <Route
            path={ROUTES.record}
            element={<Navigate to={`${ROUTES.home}?${RECORD_QUERY}=1`} replace />}
          />
          <Route path={ROUTES.report} element={<ReportPage />} />
          <Route path={ROUTES.manage} element={<ManagePage />} />
          <Route path={ROUTES.categories} element={<CategoriesPage />} />
          <Route path={ROUTES.tags} element={<TagsPage />} />
          <Route path={ROUTES.recurring} element={<RecurringPage />} />
          <Route path={ROUTES.calendar} element={<CalendarPage />} />
          <Route path={ROUTES.goal} element={<GoalPage />} />
          <Route path={ROUTES.assets} element={<AssetsPage />} />
          <Route path={ROUTES.settings} element={<SettingsPage />} />
          <Route path={ROUTES.privacy} element={<PrivacyPage />} />
          <Route path={ROUTES.notifications} element={<NotificationSettingsPage />} />
          <Route path={ROUTES.account} element={<AccountPage />} />
          {DemoGallery != null && <Route path={DEMO_PATH} element={<DemoGallery />} />}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
