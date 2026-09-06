import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '30s', target: 20 },
    { duration: '10s', target: 0 },
  ],

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const response = http.get(`${BASE_URL}/items?page=1&limit=10`);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response contains items': (r) => {
      try {
        return Array.isArray(r.json().items);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
