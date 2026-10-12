import 'package:flutter_test/flutter_test.dart';
import 'package:orthocare_ai/models/chat_message.dart';

final _t0 = DateTime(2026, 10, 12, 10);
var _n = 0;

ChatMessage patient(String text) =>
    ChatMessage(id: 'p${_n++}', sender: MessageSender.patient, text: text, createdAt: _t0);

ChatMessage answer(String text, {bool needsHuman = false, bool? helpful, String? reason = 'answered'}) => ChatMessage(
      id: 'a${_n++}',
      sender: MessageSender.assistant,
      text: text,
      createdAt: _t0,
      needsHumanFollowUp: needsHuman,
      helpful: helpful,
      reason: reason,
    );

ChatMessage greeting() => answer("Hi! I'm Dr. Shekhar Srivastav's Assistant.", reason: 'greeting');

ChatMessage followUp(String q) => answer(q, reason: 'awaiting_patient_reply: asked_surgery');

void main() {
  test('no feedback in an empty conversation', () {
    expect(feedbackTargetMessageId([]), isNull);
  });

  test('no feedback after the FIRST assistant response, even a real answer', () {
    final first = answer('Keep the leg elevated.');
    expect(feedbackTargetMessageId([patient('My knee is swollen'), first]), isNull);
  });

  test('feedback becomes eligible on the SECOND assistant response', () {
    final second = answer('Ankle pumps help with swelling.');
    final convo = [patient('Hi'), greeting(), patient('My knee is swollen'), second];
    expect(feedbackTargetMessageId(convo), second.id);
  });

  test('across four responses, only the latest eligible answer carries feedback', () {
    final a1 = greeting();
    final a2 = followUp('Which surgery did you have?');
    final a3 = answer('Mild swelling is normal after TKR.');
    final a4 = answer('Use pillows under the ankle, not the knee.');
    final convo = [
      patient('Hi'),
      a1,
      patient('Leg swelling'),
      a2,
      patient('Knee replacement'),
      a3,
      patient('Pillows?'),
      a4
    ];

    expect(feedbackTargetMessageId(convo), a4.id);
    // And at the moment a3 was the latest message, a3 was the one.
    expect(feedbackTargetMessageId(convo.sublist(0, 6)), a3.id);
    // After the first two responses (greeting + follow-up question) - nothing.
    expect(feedbackTargetMessageId(convo.sublist(0, 4)), isNull);
  });

  test('patient messages never count as responses, however many there are', () {
    final a1 = answer('Keep it dry.');
    final convo = [patient('q1'), patient('q2'), patient('q3'), patient('q4'), a1];
    expect(feedbackTargetMessageId(convo), isNull);
  });

  test('the same reply shown twice is not double-counted (controller de-dupes by id)', () {
    // The controller drops a reply whose id is already in the list, so a
    // duplicate re-send never yields a second response.
    final a1 = answer('Keep it dry.');
    final convo = [patient('Is it ok to shower?'), a1];
    final deduped = [...convo, if (!convo.any((m) => m.id == a1.id)) a1];
    expect(deduped.where((m) => m.sender == MessageSender.assistant), hasLength(1));
    expect(feedbackTargetMessageId(deduped), isNull);
  });

  test('a question back to the patient never carries feedback', () {
    final convo = [patient('Hi'), greeting(), patient('Swelling'), followUp('Is the calf red or warm?')];
    expect(feedbackTargetMessageId(convo), isNull);
  });

  test('a reply already escalated to the clinic team does not offer "talk to a doctor" again', () {
    final convo = [patient('Hi'), greeting(), patient('Chest pain'), answer('Go to the ER now.', needsHuman: true)];
    expect(feedbackTargetMessageId(convo), isNull);
  });

  test('once answered, the prompt goes away', () {
    final convo = [patient('Hi'), greeting(), patient('q'), answer('a', helpful: true)];
    expect(feedbackTargetMessageId(convo), isNull);
  });

  test('once the patient sends a new message, the previous prompt goes away', () {
    final convo = [patient('Hi'), greeting(), patient('q'), answer('a'), patient('another question')];
    expect(feedbackTargetMessageId(convo), isNull);
  });

  test('system messages do not count as assistant responses', () {
    final system = ChatMessage(id: 's', sender: MessageSender.system, text: 'Session resumed', createdAt: _t0);
    final convo = [system, patient('q'), answer('a')];
    expect(feedbackTargetMessageId(convo), isNull);
  });
}
