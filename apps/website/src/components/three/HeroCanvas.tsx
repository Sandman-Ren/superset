"use client";

import { Center, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Mesh, PointLight } from "three";
import * as THREE from "three";

function LitBackground() {
    const meshRef = useRef<Mesh>(null);
    const lightRef = useRef<PointLight>(null);
    const textGroupRef = useRef<THREE.Group>(null);
    const { viewport, camera } = useThree();

    useFrame((state) => {
        if (lightRef.current) {
            // Convert normalized mouse coords to viewport coordinates
            const x = (state.mouse.x * viewport.width) / 2;
            const y = (state.mouse.y * viewport.height) / 2;
            // Position light slightly in front of the plane
            lightRef.current.position.set(x, y, 2);

            // Change color based on position - cooler palette (blue to cyan to purple)
            // Map x position to hue range: 180° (cyan) to 270° (blue/purple)
            const hue = 180 + ((state.mouse.x + 1) / 2) * 90; // 180-270 degrees
            // Map y position to saturation
            const saturation = 60 + ((state.mouse.y + 1) / 2) * 40; // 60-100%
            const lightness = 65; // Slightly brighter for cool colors

            lightRef.current.color.setHSL(hue / 360, saturation / 100, lightness / 100);
        }

        // Make the text group face the camera
        if (textGroupRef.current) {
            textGroupRef.current.lookAt(camera.position);
        }

        // Make the plane always face the camera
        if (meshRef.current) {
            meshRef.current.lookAt(camera.position);

            // Animate the wavy displacement
            const geometry = meshRef.current.geometry;
            const positionAttribute = geometry.attributes.position;
            const time = state.clock.elapsedTime;

            if (!positionAttribute) {
                return;
            }

            for (let i = 0; i < positionAttribute.count; i++) {
                const x = positionAttribute.getX(i);
                const y = positionAttribute.getY(i);

                // Create wave effect using sine waves
                const wave1 = Math.sin(x * 0.5 + time * 0.5) * 0.1;
                const wave2 = Math.sin(y * 0.5 + time * 0.3) * 0.1;
                const z = wave1 + wave2;

                positionAttribute.setZ(i, z);
            }

            positionAttribute.needsUpdate = true;
            geometry.computeVertexNormals();
        }
    });

    return (
        <>
            {/* Background plane that fills the viewport and faces camera */}
            <mesh ref={meshRef} position={[0, 0, 0]}>
                <planeGeometry
                    args={[viewport.width * 1.5, viewport.height * 1.5, 50, 50]}
                />
                <meshStandardMaterial color="#1a1a1a" roughness={0.8} metalness={0.2} />
            </mesh>

            {/* 3D Text that reacts to light */}
            <group ref={textGroupRef} position={[0, 0.5, 1]}>
                {/* Outer edge layer - highly metallic */}
                <Text
                    position={[0, 0, 0.02]}
                    fontSize={1.805}
                    color="#000000"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.008}
                    outlineColor="#000000"
                >
                    ⊇
                    <meshStandardMaterial
                        color="#000000"
                        metalness={0.1}
                        roughness={0.9}
                        emissive="#000000"
                        emissiveIntensity={0}
                        envMapIntensity={0.2}
                    />
                </Text>

                {/* Create depth by layering multiple text instances */}
                {[...Array(30)].map((_, i) => (
                    <Text
                        key={i.toString()}
                        position={[0, 0, -i * 0.025]}
                        fontSize={1.8}
                        color="#0a0a0a"
                        anchorX="center"
                        anchorY="middle"
                    >
                        ⊇
                        <meshStandardMaterial
                            color="#2c3539"
                            metalness={0.85}
                            roughness={0.25}
                            emissive="#000000"
                            emissiveIntensity={0}
                            envMapIntensity={1.5}
                        />
                    </Text>
                ))}
            </group>

            {/* Ambient light for base visibility */}
            <ambientLight intensity={0.4} />

            {/* Static directional lights for consistent highlights */}
            <directionalLight position={[10, 10, 5]} intensity={1.2} color="#ffffff" />
            <directionalLight position={[-8, -8, 5]} intensity={0.6} color="#4488ff" />

            {/* Point light that follows mouse */}
            <pointLight
                ref={lightRef}
                intensity={25}
                color="#ffffff"
                distance={50}
                decay={1.2}
            />
        </>
    );
}

interface HeroCanvasProps {
    className?: string;
}

export function HeroCanvas({ className }: HeroCanvasProps) {
    return (
        <div className={className} style={{ pointerEvents: "auto" }}>
            <Canvas
                camera={{ position: [0, 0, 5], fov: 45 }}
                style={{ background: "#0a0a0a" }}
            >
                <Suspense fallback={null}>
                    <LitBackground />
                </Suspense>
            </Canvas>
        </div>
    );
}
