import test from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { Timestamp as WebTimestamp } from "firebase/firestore";
import { photoIdentity } from "./photo-identity";

test("legacy photos match despite key order and Timestamp JSON serialization", () => {
  const createdAt = Timestamp.fromMillis(1720000000123);
  const stored = {path:"revisions/work/eq/photo.jpg",url:"https://example.test/photo",createdAt,fileName:"photo.jpg"};
  assert.equal(photoIdentity(stored), photoIdentity({fileName:"photo.jpg",createdAt:{seconds:createdAt.seconds,nanoseconds:createdAt.nanoseconds},url:stored.url,path:stored.path}));
  assert.equal(photoIdentity(stored),photoIdentity({...stored,createdAt:createdAt.toDate().toISOString()}));
  assert.equal(photoIdentity(stored),photoIdentity(JSON.parse(JSON.stringify({...stored,createdAt:WebTimestamp.fromMillis(1720000000123)}))));
  assert.notEqual(photoIdentity(stored),photoIdentity({...stored,url:"https://example.test/forged"}));
  assert.notEqual(photoIdentity(stored),photoIdentity({...stored,path:"another-ticket/photo.jpg"}));
  assert.notEqual(photoIdentity(stored),photoIdentity({...stored,id:"forged"}));
});
