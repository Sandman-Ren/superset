"use client";

import { Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { Mesh, PointLight } from "three";
import * as THREE from "three";
import { useHeroVisibility } from "../motion/HeroParallax";

// Custom shader for wave animation (GPU-accelerated)
const waveVertexShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 pos = position;

    // Create wave effect using sine waves
    float wave1 = sin(pos.x * 0.5 + uTime * 0.5) * 0.1;
    float wave2 = sin(pos.y * 0.5 + uTime * 0.3) * 0.1;
    pos.z += wave1 + wave2;

    // Calculate normal based on wave derivatives for proper lighting
    float dx = cos(pos.x * 0.5 + uTime * 0.5) * 0.05;
    float dy = cos(pos.y * 0.5 + uTime * 0.3) * 0.05;
    vec3 computedNormal = normalize(vec3(-dx, -dy, 1.0));

    vNormal = normalize(normalMatrix * computedNormal);
    vPosition = (modelViewMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waveFragmentShader = `
  uniform vec3 uColor;
  uniform float uRoughness;
  uniform float uMetalness;
  uniform vec3 uLightPosition;
  uniform vec3 uLightColor;
  uniform float uLightIntensity;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Calculate light direction and distance
    vec3 lightDir = uLightPosition - vPosition;
    float distance = length(lightDir);
    lightDir = normalize(lightDir);

    // Attenuation (light falloff) - much stronger falloff
    float attenuation = uLightIntensity / (1.0 + 0.1 * distance + 0.05 * distance * distance);

    // Diffuse lighting - very subtle
    float diff = max(dot(vNormal, lightDir), 0.0);

    // Specular lighting - very subtle
    vec3 viewDir = normalize(-vPosition);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), 32.0);

    // Combine lighting - much more subtle effect
    vec3 ambient = uColor * 0.95;  // Mostly base color
    vec3 diffuse = uColor * diff * uLightColor * attenuation * 0.15;  // Very subtle diffuse
    vec3 specular = uLightColor * spec * attenuation * 0.05 * (1.0 - uRoughness);  // Very subtle specular

    vec3 finalColor = ambient + diffuse + specular;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function LitBackground() {
    const meshRef = useRef<Mesh>(null);
    const lightRef = useRef<PointLight>(null);
    const textGroupRef = useRef<THREE.Group>(null);
    const { viewport, camera } = useThree();
    const isVisible = useHeroVisibility();

    // Create shader material with uniforms
    const shaderMaterial = useMemo(
        () => ({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color("#1a1a1a") },
                uRoughness: { value: 0.8 },
                uMetalness: { value: 0.2 },
                uLightPosition: { value: new THREE.Vector3(0, 0, 2) },
                uLightColor: { value: new THREE.Color("#ffffff") },
                uLightIntensity: { value: 25 },
            },
            vertexShader: waveVertexShader,
            fragmentShader: waveFragmentShader,
        }),
        [],
    );

    useFrame((state) => {
        // Skip expensive operations when hero is not visible
        if (!isVisible) return;

        // Check if mouse has moved (not at default 0,0)
        const hasMouseMoved = state.mouse.x !== 0 || state.mouse.y !== 0;

        // Convert normalized mouse coords to full viewport range, or use default position
        const x = hasMouseMoved
            ? state.mouse.x * viewport.width
            : viewport.width * 0.18; // A bit more to the right
        const y = hasMouseMoved
            ? state.mouse.y * viewport.height
            : viewport.height * 0.01; // Down lower (negative y moves down)

        // Change color based on position - cooler palette (blue to cyan to purple)
        const hue = 180 + ((state.mouse.x + 1) / 2) * 90; // 180-270 degrees
        const saturation = 60 + ((state.mouse.y + 1) / 2) * 40; // 60-100%
        const lightness = 65; // Slightly brighter for cool colors

        if (lightRef.current) {
            // Position light slightly in front of the plane
            lightRef.current.position.set(x, y, 2);
            lightRef.current.color.setHSL(
                hue / 360,
                saturation / 100,
                lightness / 100,
            );
        }

        // Make the text group face the camera
        if (textGroupRef.current) {
            textGroupRef.current.lookAt(camera.position);
        }

        // Make the plane always face the camera and update shader uniforms
        if (meshRef.current) {
            meshRef.current.lookAt(camera.position);

            // Update shader uniforms (GPU handles the animation and lighting)
            const material = meshRef.current.material as THREE.ShaderMaterial;
            if (material.uniforms) {
                if (material.uniforms.uTime) {
                    material.uniforms.uTime.value = state.clock.elapsedTime;
                }
                // Update light position and color in shader
                if (material.uniforms.uLightPosition) {
                    material.uniforms.uLightPosition.value.set(x, y, 2);
                }
                if (material.uniforms.uLightColor) {
                    material.uniforms.uLightColor.value.setHSL(
                        hue / 360,
                        saturation / 100,
                        lightness / 100,
                    );
                }
            }
        }
    });

    return (
        <>
            {/* Background plane that fills the viewport and faces camera */}
            <mesh ref={meshRef} position={[0, 0, 0]}>
                <planeGeometry
                    args={[viewport.width * 1.5, viewport.height * 1.5, 40, 40]}
                />
                <shaderMaterial
                    attach="material"
                    uniforms={shaderMaterial.uniforms}
                    vertexShader={shaderMaterial.vertexShader}
                    fragmentShader={shaderMaterial.fragmentShader}
                />
            </mesh>

            {/* 3D Text that reacts to light */}
            <group ref={textGroupRef} position={[0, 0.5, 1]}>
                {/* Outer edge layer - highly metallic */}
                <Text
                    position={[0, 0, 0.02]}
                    fontSize={1.805}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.0001}
                    outlineColor="#575757"
                >
                    ⊇
                    <meshBasicMaterial color="#000000" />
                </Text>

                {/* Create depth by layering multiple text instances - reduced from 30 to 15 for performance */}
                {[...Array(15)].map((_, i) => (
                    <Text
                        key={i.toString()}
                        position={[0, 0, -i * 0.05]}
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
            <ambientLight intensity={1} />

            {/* Static directional lights for consistent highlights */}
            <directionalLight
                position={[10, 10, 5]}
                intensity={1.2}
                color="#ffffff"
            />
            <directionalLight
                position={[-8, -8, 5]}
                intensity={0.6}
                color="#4488ff"
            />

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
        <div
            className={className}
            style={{
                pointerEvents: "auto",
                willChange: "transform",
                transform: "translateZ(0)",
            }}
        >
            <Canvas
                camera={{ position: [0, 0, 5], fov: 45 }}
                style={{ background: "#0a0a0a" }}
                dpr={[1, 2]} // Limit pixel ratio for better performance
                performance={{ min: 0.5 }} // Allow frame rate to drop if needed
                frameloop="always" // Ensure consistent frame loop
                gl={{
                    antialias: true,
                    alpha: false,
                    powerPreference: "high-performance",
                }}
            >
                <Suspense fallback={null}>
                    <LitBackground />
                </Suspense>
            </Canvas>
        </div>
    );
}
