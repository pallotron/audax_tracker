import { useParams } from "react-router-dom";

export default function QualificationDetailPage() {
  const { type } = useParams<{ type: string }>();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        Qualification: {type}
      </h1>
      <p className="mt-2 text-gray-600">Coming soon</p>
    </div>
  );
}
