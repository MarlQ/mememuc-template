import 'antd/dist/reset.css';
import './index.css';

import { ConfigProvider, message } from 'antd';
import React, { StrictMode } from 'react';
import { RecoilRoot } from 'recoil';
import { Router } from './router';

export const App = () => {
  // TODO: does not work
  message.config({ maxCount: 3 });

  return (
      <StrictMode>
        <RecoilRoot>
          <ConfigProvider theme={{ token: { colorPrimary: '#232323' } }}>
            <Router />
          </ConfigProvider>
        </RecoilRoot>
      </StrictMode>
  );
};