export const SAMPLE_RESEARCH_BRIEFING = `
# [주간 연구 브리핑] 2026년 8월 1주차 - 멀티모달 비전-언어 모델 & 동물 행동 분석 연구 동향

---

## 1. 이번 주 주목할 연구 논문 (Papers)

### [논문 1] Video-LLaVA-2: Dense Spatial-Temporal Action Understanding in Long Videos
- **저자**: Jun Kang, Elena Rostova, Marcus Chen, et al.
- **출판/공개**: CVPR 2025 (Oral Accepted)
- **arXiv**: arXiv:2412.08910
- **공식 링크**: https://arxiv.org/abs/2412.08910
- **핵심 문제**: 장시간 비동기 비디오에서 프레임 단위 미세 행동 인식 및 시간적 인과관계 추론
- **제안 방법**: Spatial-Temporal Query Sampler와 3D FlashAttention-V2 기반 인코더 결합
- **주요 성과**: ActivityNet QA 및 Ego4D Benchmark에서 기존 Video-LLaVA 대비 mAP +4.2% 향상 (SOTA 달성)
- **코드 및 데이터**: 공개 (GitHub: https://github.com/video-llava/video-llava-2)

### [논문 2] BehaviorCLIP: Zero-Shot Animal Pose Estimation and Action Classification
- **저자**: Sarah Jenkins, David Kim, Hans Mueller
- **출판/공개**: NeurIPS 2024
- **arXiv**: arXiv:2410.14592
- **DOI**: 10.48550/arXiv.2410.14592
- **핵심 문제**: 야생 동물 및 실용 동물 행동 데이터셋 부족 극복을 위한 Zero-shot 포즈 추정
- **제안 방법**: Text-Guided Keypoint Masking 및 Contrastive Behavior Pre-training
- **주요 성과**: OpenMammal-10K 데이터셋에서 Supervised Baseline 대비 89% 수준 accuracy 달성
- **코드 및 데이터**: 코드 공개 예정 (GitHub 레포 준비 중), 데이터셋은 일부 샘플만 공개

### [논문 3] Sparse-Track3D: Real-time Multi-Object 3D Tracking with Point Cloud Diffusion
- **저자**: Hiroshi Tanaka, Alex Smith
- **출판/공개**: IEEE TPAMI (Under Review / arXiv Preprint)
- **arXiv**: arXiv:2501.03211
- **핵심 문제**: 자율주행 및 로보틱스용 라이다 포인트 클라우드에서 밀집 실시간 3D 객체 추적
- **제안 방법**: Lightweight Denoising Diffusion Probabilistic Model (DDPM) 기반 궤적 예측
- **주요 성과**: KITTI 3D Benchmark에서 45 FPS 실시간 처리 및 MOTA 78.4%
- **코드 및 데이터**: 코드 미공개 (추후 공개 예정)

### [논문 4] Gen-Physiology: Generative World Models for Rodent Neural Mechanics
- **저자**: Clara Vance et al.
- **출판/공개**: bioRxiv 2025
- **DOI**: 10.1101/2025.01.15.589120
- **핵심 문제**: 설치류 신경망 활동-근골격 행동 신호의 양방향 생체 시뮬레이션
- **제안 방법**: Biomechanical Transformer Dynamics with Spike Train Latent Encoding
- **주요 성과**: Neuropixels 기록 데이터셋에서 행동 예측 오차 32% 감소
- **코드 및 데이터**: 데이터셋 오픈소스 공개 (DANDI Archive #000412)

---

## 2. 신규 공개 데이터셋 (Datasets)

- **EgoBehavior-100K**: 100가지 야외 동물 및 사용자 상호작용 비디오 비구조화 키포인트 데이터셋 (URL: https://huggingface.co/datasets/egobehavior/100k)
- **RodentSpike-3D**: 3D 모션 캡처 및 1024 채널 신경 가시성 레코딩 벤치마크

---

## 3. GitHub 레포지토리 및 연구 도구 (Tools)

- **DeepLabCut-v3.2**: Multi-animal 3D tracking GUI toolkit (https://github.com/DeepLabCut/DeepLabCut)
- **vLLM-Vision-Server**: 멀티모달 비전언어모델 고속 추론 서빙 파이프라인 (https://github.com/vllm-project/vllm)

---

## 4. 분야 연구 동향 및 요약 (Trends)

- 비전-언어 모델(VLM)의 스파이시얼-템포럴(Spatial-Temporal) 비디오 이해 능력이 장시간 비디오 및 인과 추론으로 확장되는 추세임.
- 동물 행동 분석 분야에서는 라벨링 비용 완화를 위한 CLIP 기반 Zero-shot 기법과 3D 뇌신경-행동 매핑 생성 모델이 핵심 패러다임으로 부상 중.

---

## 5. 논문 읽기 계획 & 팀 내부 알림

- 이번 주 금요일 16시 연구실 논문 세미나에서 발제할 논문 1편을 선택해야 함.
- 팀원 민수: "BehaviorCLIP 논문의 Zero-shot 키포인트 트랜스퍼 방식이 우리 동물 임상 프로젝트에 바로 적응 가능한지 검토해봅시다."
`.trim();
